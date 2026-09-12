import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Session = { sub: string; exp: number; access_level?: string };

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

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(saltHex + password),
  );
  const hashHex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = token ? await verifySession(token) : null;
    if (!session) return json({ error: "Sessão inválida ou expirada" }, 401, origin);
    if (session.access_level !== "master") {
      return json({ error: "Apenas o Master pode alterar credenciais." }, 403, origin);
    }

    const { collaboratorId, password, login, access_level } = await request.json();
    if (!collaboratorId || !password) {
      return json({ error: "collaboratorId e password são obrigatórios" }, 400, origin);
    }

    const { data: current, error: currentError } = await supabase
      .from("maestro_collaborators")
      .select("profile")
      .eq("id", collaboratorId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return json({ error: "Colaborador não encontrado" }, 404, origin);

    const hashedPassword = await hashPassword(String(password));
    const profile = {
      ...(current.profile || {}),
      ...(login !== undefined ? { login: String(login) } : {}),
      ...(access_level !== undefined ? { access_level: String(access_level) } : {}),
      id: collaboratorId,
    };
    const now = new Date().toISOString();

    const { error: authError } = await supabase
      .from("maestro_collaborators")
      .update({
        login: String(login ?? current.profile?.login ?? collaboratorId),
        password_hash: hashedPassword,
        profile,
        source_updated_at: now,
      })
      .eq("id", collaboratorId);
    if (authError) throw authError;

    const { data: legacy, error: legacyReadError } = await supabase
      .from("legacy_records")
      .select("payload")
      .eq("entity", "Collaborator")
      .eq("record_id", collaboratorId)
      .maybeSingle();
    if (legacyReadError) throw legacyReadError;

    if (legacy) {
      const payload = {
        ...(legacy.payload || {}),
        ...profile,
        password_hash: hashedPassword,
      };
      const { error: legacyError } = await supabase
        .from("legacy_records")
        .update({ payload, source_updated_at: now })
        .eq("entity", "Collaborator")
        .eq("record_id", collaboratorId);
      if (legacyError) throw legacyError;
    }

    return json({ success: true }, 200, origin);
  } catch (error) {
    console.error("hashCollaboratorPassword error:", error);
    return json({ error: "Erro ao atualizar credenciais" }, 500, origin);
  }
});
