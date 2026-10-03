import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadActiveProspectingManagerSession } from "../_shared/prospecting-authorization.mjs";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const decode = (value: string) => atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));

async function verifySession(token: string) {
  const secret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
  const [body, rawSig] = token.split(".");
  if (!secret || !body || !rawSig) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(rawSig), (char) => char.charCodeAt(0)), new TextEncoder().encode(body));
    if (!valid) return null;
    const session = JSON.parse(decode(body));
    return session.exp < Math.floor(Date.now() / 1000) ? null : session;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    const claims = await verifySession(token);
    const session = claims ? await loadActiveProspectingManagerSession(supabase, claims) : null;
    if (!session) {
      return json({ error: "O enriquecimento de leads está disponível apenas para Gestor ou Master com vínculo ativo." }, 403);
    }

    const body = await request.json();
    const cnpj = String(body.cnpj || "").replace(/[^a-z\d]/gi, "").toUpperCase();
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return json({ error: "Formato de CNPJ inválido: use 14 caracteres, com os dois últimos numéricos." }, 400);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(cnpj)}`, { signal: controller.signal, headers: { Accept: "application/json" } });
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 404) return json({ error: "CNPJ não encontrado na BrasilAPI." }, 404);
    if (response.status === 429) return json({ error: "A BrasilAPI limitou consultas temporariamente. Aguarde um pouco e tente novamente." }, 429);
    if (!response.ok) return json({ error: `A BrasilAPI não concluiu a consulta (HTTP ${response.status}).` }, 502);

    const data = await response.json();
    const qsa = Array.isArray(data.qsa) ? data.qsa.map((partner: Record<string, unknown>) => ({
      nome: String(partner.nome_socio || ""),
      qualificacao: String(partner.qualificacao_socio || ""),
      entrada: String(partner.data_entrada_sociedade || ""),
    })).filter((partner: { nome: string }) => partner.nome) : [];
    return json({ company: {
      cnpj: String(data.cnpj || cnpj),
      razao_social: String(data.razao_social || ""),
      nome_fantasia: String(data.nome_fantasia || ""),
      situacao_cadastral: String(data.descricao_situacao_cadastral || data.situacao_cadastral || ""),
      capital_social: Number(data.capital_social || 0),
      logradouro: [data.descricao_tipo_de_logradouro, data.logradouro, data.numero, data.complemento].filter(Boolean).join(" "),
      bairro: String(data.bairro || ""),
      municipio: String(data.municipio || ""),
      uf: String(data.uf || ""),
      cep: String(data.cep || ""),
      telefone: [data.ddd_telefone_1, data.ddd_telefone_2].filter(Boolean).map(String),
      email: String(data.email || ""),
      socios: qsa,
      fonte: "BrasilAPI",
    } });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "A BrasilAPI demorou mais que o esperado. Tente novamente."
      : "Não foi possível consultar a BrasilAPI agora.";
    return json({ error: message }, 502);
  }
});
