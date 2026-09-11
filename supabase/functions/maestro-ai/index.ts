import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const secret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const origins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
  "http://localhost:4174",
  "http://127.0.0.1:4175",
  "http://localhost:4175",
  "https://dominiomaestro.com.br",
]);
const headers = (origin: string) => ({ "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://dominiomaestro.com.br", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" });
const decode = (value: string) => atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));

async function validSession(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(signature), c => c.charCodeAt(0)), new TextEncoder().encode(body));
  if (!valid) return false;
  const session = JSON.parse(decode(body));
  if (!session.sub || session.exp < Math.floor(Date.now() / 1000)) return false;
  const { data } = await db.from("maestro_collaborators").select("id, is_active").eq("id", session.sub).maybeSingle();
  return Boolean(data?.is_active);
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), "Content-Type": "application/json" } });
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !(await validSession(token))) return json({ error: "Sessão inválida ou expirada" }, 401, origin);
    const { message, history = [], context = {} } = await request.json();
    if (typeof message !== "string" || !message.trim()) return json({ error: "Mensagem obrigatória" }, 400, origin);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "A integração com o ChatGPT ainda não foi configurada." }, 503, origin);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
        instructions: "Você é o ChatGPT integrado ao Maestro, uma plataforma brasileira para agências. Responda em português, com objetividade, sem inventar dados. Ajude com análises do sistema, finanças, legendas e briefings.",
        input: [...(Array.isArray(history) ? history.slice(-12).map(item => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "") })) : []), { role: "user", content: `${message.trim()}\n\nContexto: ${JSON.stringify(context)}` }],
      }),
    });
    const result = await response.json();
    if (!response.ok) return json({ error: result?.error?.message || "Não foi possível consultar o ChatGPT." }, 502, origin);

    // The REST response may expose output_text directly or return the text
    // inside output[].content[]. Keep both formats compatible.
    const output = result.output_text || (Array.isArray(result.output)
      ? result.output.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || [])
        .map((item: { text?: string }) => item.text || "")
        .filter(Boolean)
        .join("\n")
      : "");
    return json({ output: output || "Não foi possível gerar uma resposta." }, 200, origin);
  } catch (error) {
    console.error("Maestro AI error:", error);
    return json({ error: "Erro ao consultar o ChatGPT." }, 500, origin);
  }
});
