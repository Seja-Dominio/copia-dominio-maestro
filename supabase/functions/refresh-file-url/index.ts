import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const bucket = "job-attachments";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const allowedOrigins = new Set(["http://127.0.0.1:4173", "http://localhost:4173", "https://dominiomaestro.com.br"]);

function corsHeaders(origin = "") {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://dominiomaestro.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function verifySession(token: string) {
  if (!sessionSecret) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(decode(signature), (character) => character.charCodeAt(0)),
    new TextEncoder().encode(body),
  );
  if (!valid) return false;
  const session = JSON.parse(decode(body)) as { sub?: string; exp?: number };
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return false;
  const { data } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active")
    .eq("id", session.sub)
    .maybeSingle();
  return Boolean(data?.is_active);
}

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !(await verifySession(token))) return json({ error: "Sessão inválida ou expirada" }, 401, origin);

    const body = await request.json() as { path?: unknown };
    const path = String(body.path || "");
    if (!path || path.length > 512 || path.startsWith("/") || path.includes("..")) {
      return json({ error: "Caminho de anexo inválido" }, 400, origin);
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
    if (error) throw error;
    return json({ file_url: data.signedUrl, path }, 200, origin);
  } catch (error) {
    console.error("refresh-file-url error:", error);
    return json({ error: "Não foi possível renovar o anexo" }, 500, origin);
  }
});
