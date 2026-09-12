import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type EvolutionConfig = { baseUrl: string; apiKey: string; instance: string };

function evolutionConfig(): EvolutionConfig | null {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  return baseUrl && apiKey && instance ? { baseUrl, apiKey, instance } : null;
}

async function evolutionRequest(config: EvolutionConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: { apikey: config.apiKey, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { response, data };
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function webhookSecretValid(request: Request) {
  const expected = Deno.env.get("DOMINUS_WEBHOOK_SECRET") || "";
  if (!expected) return false;
  const supplied = request.headers.get("x-maestro-webhook-secret") || request.headers.get("x-webhook-secret") || new URL(request.url).searchParams.get("token") || "";
  return supplied.length === expected.length && supplied === expected;
}

function normalizePhone(value: unknown) {
  const raw = String(value || "").split("@")[0].split(":")[0];
  return raw.replace(/\D/g, "");
}

function textFromMessage(data: any) {
  return String(
    data?.message?.conversation ||
    data?.message?.extendedTextMessage?.text ||
    data?.message?.imageMessage?.caption ||
    data?.message?.videoMessage?.caption ||
    data?.body ||
    data?.text ||
    "",
  ).trim();
}

function webhookMessage(body: any) {
  const data = body?.data || body;
  const key = data?.key || data?.message?.key || {};
  const remoteJid = String(key.remoteJid || data?.remoteJid || data?.chatId || "");
  const senderJid = String(key.participant || data?.participant || data?.sender || key.remoteJid || "");
  const fromMe = key.fromMe === true || String(key.fromMe || data?.fromMe || "").toLowerCase() === "true";
  return { data, remoteJid, senderJid, fromMe, text: textFromMessage(data) };
}

async function activeDominusForGroup(groupId: string) {
  const { data, error } = await supabase
    .from("legacy_records")
    .select("record_id,payload")
    .eq("entity", "WhatsappAutomation")
    .range(0, 9999);
  if (error) throw error;
  return (data || [])
    .map((row: any) => ({ id: row.record_id, ...(row.payload || {}) }))
    .find((automation: any) => {
      if (automation.kind !== "dominus" || automation.active === false) return false;
      const groups = Array.isArray(automation.group_ids) ? automation.group_ids.map(String) : [];
      if (automation.group_id) groups.push(String(automation.group_id));
      return [...new Set(groups)].includes(groupId);
    }) || null;
}

async function findActiveCollaborator(senderJid: string) {
  const senderPhone = normalizePhone(senderJid);
  if (!senderPhone) return null;
  const { data, error } = await supabase
    .from("maestro_collaborators")
    .select("id,is_active,profile")
    .eq("is_active", true)
    .range(0, 9999);
  if (error) throw error;
  return (data || []).find((row: any) => {
    const profile = row.profile || {};
    return [profile.whatsapp_phone, profile.phone, profile.phone_number, profile.whatsapp]
      .map(normalizePhone)
      .filter(Boolean)
      .includes(senderPhone);
  }) || null;
}

function encode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signMaestroSession(collaboratorId: string) {
  const secret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
  if (!secret) throw new Error("MAESTRO_SESSION_SECRET não configurado");
  const body = encode(JSON.stringify({ sub: collaboratorId, exp: Math.floor(Date.now() / 1000) + 300 }));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function askMaestro(collaboratorId: string, question: string) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (!baseUrl) throw new Error("SUPABASE_URL não configurado");
  const token = await signMaestroSession(collaboratorId);
  const response = await fetch(`${baseUrl}/functions/v1/maestro-ai`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Você é o agente Dominus, assistente interno da empresa. Responda em português, de forma objetiva e adequada para leitura em um grupo. Consulte os dados do Maestro somente quando forem necessários para responder à pergunta. Use exclusivamente os dados autorizados ao colaborador autenticado, não exponha credenciais e diga quando não houver acesso ou dados suficientes. Não altere nada no sistema. Pergunta recebida no grupo: <<<${question.slice(0, 4000)}>>>`,
      history: [],
      context: { page: "WhatsApp — grupo autorizado", task: "Consulta do Dominus", job: {} },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || "Não foi possível consultar o Maestro");
  return { text: String(data?.output || "Não consegui gerar uma resposta agora.").trim().slice(0, 3500), tools: Array.isArray(data?.tools_used) ? data.tools_used : [] };
}

async function audit(groupId: string, senderJid: string, collaboratorId: string, tools: string[]) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("legacy_records").insert({
    entity: "DominusQueryLog",
    record_id: crypto.randomUUID().replaceAll("-", ""),
    payload: { group_id: groupId, sender_jid: senderJid, collaborator_id: collaboratorId, tools, created_date: now },
    source_created_at: now,
    source_updated_at: now,
  });
  if (error) console.warn("Dominus audit log failed:", error.message);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);
  if (!webhookSecretValid(request)) return json({ error: "Webhook não autorizado" }, 401);
  try {
    const config = evolutionConfig();
    if (!config) return json({ error: "Evolution API não configurada no servidor" }, 503);
    const body = await request.json();
    const message = webhookMessage(body);
    if (message.fromMe || !message.remoteJid.endsWith("@g.us") || !/\bDominus\b/i.test(message.text)) return json({ received: true, responded: false });

    const automation = await activeDominusForGroup(message.remoteJid);
    if (!automation) return json({ received: true, responded: false });
    const collaborator = await findActiveCollaborator(message.senderJid);
    if (!collaborator) return json({ received: true, responded: false });

    const answer = await askMaestro(String(collaborator.id), message.text);
    const sent = await evolutionRequest(config, `/message/sendText/${encodeURIComponent(config.instance)}`, {
      method: "POST",
      body: JSON.stringify({ number: message.remoteJid, text: answer.text }),
    });
    if (!sent.response.ok) throw new Error(sent.data?.message || "A Evolution API recusou a resposta");
    await audit(message.remoteJid, message.senderJid, String(collaborator.id), answer.tools);
    return json({ received: true, responded: true, automation_id: automation.id });
  } catch (error) {
    console.error("Dominus webhook error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao processar a mensagem" }, 500);
  }
});
