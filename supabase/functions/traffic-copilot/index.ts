import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { accessLevelForOrganizationRole, selectOrganizationMembership } from "../_shared/maestro-tenant.mjs";
import { hasActiveOrganizationProduct } from "../_shared/organization-products.mjs";

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

function currentManausDate() {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return {
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
    display: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", dateStyle: "full", timeStyle: "short" }).format(now),
  };
}

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

  let membershipsQuery = db.from("organization_members")
    .select("organization_id,role,status,organizations!inner(status)")
    .eq("collaborator_id", session.sub)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(2);
  if (session.organization_id) membershipsQuery = membershipsQuery.eq("organization_id", session.organization_id);
  const { data: memberships, error: membershipError } = await membershipsQuery;
  if (membershipError) return null;
  const choice = selectOrganizationMembership(memberships, session.organization_id);
  if (!choice.ok) return null;

  const profile = (collaborator.profile || {}) as Record<string, unknown>;
  return {
    id: collaborator.id,
    name: profile.name || profile.full_name || "",
    full_name: profile.full_name || profile.name || "",
    role: profile.role || "",
    access_level: accessLevelForOrganizationRole(choice.membership.organization_role),
    organization_id: choice.membership.organization_id,
    permissions: profile.permissions && typeof profile.permissions === "object" && !Array.isArray(profile.permissions)
      ? profile.permissions
      : {},
    is_active: collaborator.is_active,
  };
}

function hasAdsBrainAccess(collaborator: Record<string, any>) {
  const rawLevel = String(collaborator.access_level || collaborator.role || "collaborator").toLowerCase();
  const accessLevel = rawLevel === "admin" ? "master" : rawLevel;
  const permissions = collaborator.permissions;
  const tabs = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? permissions.tabs
    : null;

  // An explicit tab decision is authoritative. Legacy collaborators without
  // a tab map keep the historical Ads Brain access for all three levels.
  if (tabs && typeof tabs === "object" && !Array.isArray(tabs) && Object.prototype.hasOwnProperty.call(tabs, "AdsBrain")) {
    return (tabs as Record<string, unknown>).AdsBrain === true;
  }

  return ["master", "gestor", "collaborator"].includes(accessLevel);
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
      instructions: "Você é o Copiloto de Tráfego da Domínio Performance. A data e o horário atuais de referência são informados nos dados recebidos no fuso America/Manaus. Use essa data para interpretar Hoje, Ontem, prazos e comparativos; nunca use a data do seu treinamento nem confunda UTC com o horário local. Responda em português, usando somente os dados recebidos. Apresente a resposta em Markdown legível: comece com um título curto, use subtítulos (##), listas curtas e destaque os alertas mais importantes. Use tabela Markdown somente quando houver comparação entre pelo menos 3 itens e 2 colunas; alinhe cada linha e não use tabela para texto corrido. Separe fatos observados, hipóteses e recomendações. Formate datas no padrão dd/MM/yyyy e valores em reais quando aplicável. Nunca retorne JSON, código ou parágrafos longos sem quebras. Não invente números, não diga que executou ações e nunca recomende alterar orçamento sem explicar o risco e pedir validação do gestor.",
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
    if (!hasAdsBrainAccess(collaborator)) return json({ error: "A aba Ads Brain não está habilitada para este usuário." }, 403, origin);
    const { data: products, error: productsError } = await db.from("organization_products")
      .select("product_key,status,expires_at")
      .eq("organization_id", collaborator.organization_id)
      .eq("product_key", "ads_brain");
    if (productsError) throw productsError;
    if (!hasActiveOrganizationProduct(products, "ads_brain")) {
      return json({ error: "O produto Ads Brain não está habilitado para esta organização." }, 403, origin);
    }
    const body = await request.json();
    const action = body.action === "mcp_query" ? "mcp_query" : "daily_analysis";
    const requestedScopes = Array.isArray(body.scopes) ? body.scopes.map(String).filter(scope => allowedScopes.has(scope)) : ["account_identity", "account_metrics", "campaigns"];
    const scopes = [...new Set(requestedScopes)];
    if (action === "mcp_query" && !String(body.question || "").trim()) return json({ error: "Informe o que deseja consultar." }, 400, origin);
    const accountIds = Array.isArray(body.account_ids) ? body.account_ids.map(String).filter(Boolean) : [];
    let query = db.from("maestro_ads_accounts").select("id,network,client_name,display_name,currency,balance,minimum_balance,spending_limit,amount_spent,metrics_data,campaigns_data,last_synced_at")
      .eq("organization_id", collaborator.organization_id);
    if (accountIds.length) query = query.in("id", accountIds);
    const { data: accounts, error } = await query.order("updated_at", { ascending: false });
    if (error) throw error;
    const currentDate = currentManausDate();
    const safeContext = { period: String(body.period || "Hoje"), currentDate: currentDate.isoDate, currentDateDisplay: currentDate.display, timeZone: "America/Manaus", generatedAt: new Date().toISOString(), scopes, accounts: buildContext(accounts || [], scopes) };
    const prompt = action === "daily_analysis"
      ? `Faça a análise diária das contas selecionadas considerando que hoje é ${currentDate.display} (${currentDate.isoDate}, fuso America/Manaus). Entregue em blocos curtos: 1) resumo executivo, 2) principais sinais positivos, 3) alertas e riscos, 4) três sugestões priorizadas para o gestor validar. Se houver várias contas, use uma tabela curta para comparar somente os indicadores mais importantes. Se não houver dados suficientes, diga exatamente o que falta.`
      : String(body.question).trim();
    const output = await askOpenAI(prompt, safeContext);
    return json({ output, scopes, accountCount: (accounts || []).length, generatedAt: safeContext.generatedAt }, 200, origin);
  } catch (error) {
    console.error("Traffic Copilot error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao consultar o Copiloto de Tráfego." }, 500, origin);
  }
});
