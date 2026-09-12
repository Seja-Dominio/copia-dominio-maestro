import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const secret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const origins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
  "http://localhost:4174",
  "https://dominiomaestro.com.br",
  "https://www.dominiomaestro.com.br",
]);
const allowedScopes = new Set(["account_identity", "account_metrics", "campaigns", "budget_limits"]);
const managerRoles = new Set(["master", "admin", "gestor", "manager", "traffic_manager"]);

function decode(value: string) {
  return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
}

async function getSession(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature || !secret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(signature), character => character.charCodeAt(0)), new TextEncoder().encode(body));
  if (!valid) return null;
  const session = JSON.parse(decode(body));
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
  const { data: collaborator, error } = await db
    .from("maestro_collaborators")
    .select("id,is_active,profile")
    .eq("id", session.sub)
    .maybeSingle();
  if (error || !collaborator?.is_active) return null;

  const profile = (collaborator.profile || {}) as Record<string, unknown>;
  return {
    id: collaborator.id,
    name: profile.name || profile.full_name || "",
    full_name: profile.full_name || profile.name || "",
    role: profile.role || "",
    access_level: profile.access_level || "collaborator",
    is_active: collaborator.is_active,
  };
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://dominiomaestro.com.br", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" } });
}

function pickMetrics(raw: any) {
  const keys = ["spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "frequency", "actions", "purchase_roas"];
  return Object.fromEntries(keys.filter(key => raw?.[key] !== undefined).map(key => [key, raw[key]]));
}

function pickCampaign(campaign: any, includeBudget: boolean) {
  const insight = campaign?.insights?.data?.[0] || {};
  const result: Record<string, unknown> = {
    id: campaign?.id,
    name: campaign?.name || "Campanha sem nome",
    status: campaign?.effective_status || campaign?.status || "",
    metrics: pickMetrics(insight),
  };
  if (includeBudget) result.budget = { daily: campaign?.daily_budget ?? null, lifetime: campaign?.lifetime_budget ?? null };
  return result;
}

function buildContext(accounts: any[], scopes: string[]) {
  const includeMetrics = scopes.includes("account_metrics");
  const includeCampaigns = scopes.includes("campaigns");
  const includeBudget = scopes.includes("budget_limits");
  return accounts.map(account => {
    const item: Record<string, unknown> = {
      id: account.id,
      client: account.client_name || account.display_name || "Cliente não identificado",
      network: account.network,
      currency: account.currency || "BRL",
      lastSyncedAt: account.last_synced_at,
    };
    if (includeMetrics) item.metrics = pickMetrics(account.metrics_data || {});
    if (includeBudget) {
      const billing = account.metrics_data?.billing_sync || {};
      item.budget = {
        balance: account.balance,
        minimumBalance: account.minimum_balance,
        spendingLimit: account.spending_limit,
        amountSpent: account.amount_spent,
        monthlySpend: billing.monthly_spend,
      };
    }
    if (includeCampaigns) item.campaigns = (Array.isArray(account.campaigns_data) ? account.campaigns_data : []).slice(0, 50).map(campaign => pickCampaign(campaign, includeBudget));
    return item;
  });
}

async function askOpenAI(message: string, context: unknown) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("A integração com o ChatGPT ainda não foi configurada.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
      instructions: "Você é o Copiloto de Tráfego da Domínio Performance. Responda em português, usando somente os dados recebidos. Separe fatos observados, hipóteses e recomendações. Não invente números, não diga que executou ações e nunca recomende alterar orçamento sem explicar o risco e pedir validação do gestor.",
      input: `${message}\n\nDados autorizados pelo usuário:\n${JSON.stringify(context)}`,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "Não foi possível consultar o Copiloto de Tráfego.");
  const output = result.output_text || (Array.isArray(result.output) ? result.output.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || []).map((item: { text?: string }) => item.text || "").filter(Boolean).join("\n") : "");
  return output || "Não foi possível gerar uma análise.";
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://dominiomaestro.com.br", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const collaborator = token ? await getSession(token) : null;
    if (!collaborator) return json({ error: "Sessão inválida ou expirada" }, 401, origin);
    const body = await request.json();
    const action = body.action === "mcp_query" ? "mcp_query" : "daily_analysis";
    const requestedScopes = Array.isArray(body.scopes) ? body.scopes.map(String).filter(scope => allowedScopes.has(scope)) : ["account_identity", "account_metrics", "campaigns"];
    const scopes = [...new Set(requestedScopes)];
    const role = String(collaborator.access_level || collaborator.role || "").toLowerCase();
    if (scopes.includes("budget_limits") && !managerRoles.has(role)) return json({ error: "Seu perfil não tem permissão para consultar limites e orçamento." }, 403, origin);
    if (action === "mcp_query" && !String(body.question || "").trim()) return json({ error: "Informe o que deseja consultar." }, 400, origin);
    const accountIds = Array.isArray(body.account_ids) ? body.account_ids.map(String).filter(Boolean) : [];
    let query = db.from("maestro_ads_accounts").select("id,network,client_name,display_name,currency,balance,minimum_balance,spending_limit,amount_spent,metrics_data,campaigns_data,last_synced_at");
    if (accountIds.length) query = query.in("id", accountIds);
    const { data: accounts, error } = await query.order("updated_at", { ascending: false });
    if (error) throw error;
    const safeContext = { period: String(body.period || "Hoje"), generatedAt: new Date().toISOString(), scopes, accounts: buildContext(accounts || [], scopes) };
    const prompt = action === "daily_analysis"
      ? "Faça a análise diária das contas selecionadas. Entregue: 1) resumo executivo, 2) principais sinais positivos, 3) alertas e riscos, 4) três sugestões priorizadas para o gestor validar. Se não houver dados suficientes, diga exatamente o que falta."
      : String(body.question).trim();
    const output = await askOpenAI(prompt, safeContext);
    return json({ output, scopes, accountCount: (accounts || []).length, generatedAt: safeContext.generatedAt }, 200, origin);
  } catch (error) {
    console.error("Traffic Copilot error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao consultar o Copiloto de Tráfego." }, 500, origin);
  }
});
