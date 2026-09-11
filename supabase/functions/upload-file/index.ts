import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Session = { sub: string; exp: number };
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

async function verifySession(token: string): Promise<Session | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
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
  if (!valid) return null;
  const session = JSON.parse(decode(body)) as Session;
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
  const { data } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active")
    .eq("id", session.sub)
    .maybeSingle();
  return data?.is_active ? session : null;
}

function response(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return response({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = token ? await verifySession(token) : null;
    if (!session) return response({ error: "Sessão inválida ou expirada" }, 401, origin);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return response({ error: "Arquivo não enviado" }, 400, origin);
    if (file.size > 50 * 1024 * 1024) return response({ error: "Arquivo excede 50 MB" }, 413, origin);

    const originalName = file.name || "arquivo";
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160);
    const path = `${session.sub}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from(bucket).upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;

    const { data, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60 * 24);
    if (signedUrlError) throw signedUrlError;
    return response({
      file_url: data.signedUrl,
      path,
      name: originalName,
      size: file.size,
      content_type: file.type || "application/octet-stream",
    }, 200, origin);
  } catch (error) {
    console.error("upload-file error:", error);
    return response({ error: "Erro ao enviar arquivo" }, 500);
  }
});
