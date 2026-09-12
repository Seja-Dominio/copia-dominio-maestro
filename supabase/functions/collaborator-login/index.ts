import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type CollaboratorRow = {
  id: string;
  login: string;
  password_hash: string;
  is_active: boolean;
  profile: Record<string, unknown>;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const allowedOrigins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
  "http://localhost:4174",
  "http://127.0.0.1:4175",
  "http://localhost:4175",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://dominiomaestro.com.br",
]);
function corsHeaders(origin = "") {
  return {
  "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://dominiomaestro.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function encode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function signSession(payload: Record<string, unknown>) {
  if (!sessionSecret) throw new Error("MAESTRO_SESSION_SECRET não configurado");
  const body = encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(saltHex + password));
  const hashHex = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string) {
  if (!storedHash) return { valid: false, needsRehash: false };
  if (!storedHash.includes(":")) return { valid: storedHash === password, needsRehash: true };

  const [saltHex, expectedHash] = storedHash.split(":");
  const data = new TextEncoder().encode(saltHex + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const actualHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { valid: actualHash === expectedHash, needsRehash: false };
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
    if (!sessionSecret) return json({ error: "Autenticação indisponível: segredo de sessão não configurado." }, 503, origin);
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);

    const { login, password } = await request.json();
    if (!login || !password) {
      return json({ error: "Login e senha são obrigatórios" }, 400, origin);
    }

    const { data, error } = await supabase
      .from("maestro_collaborators")
      .select("id, login, password_hash, is_active, profile")
      .ilike("login", String(login).trim())
      .maybeSingle<CollaboratorRow>();

    if (error) throw error;
    const passwordCheck = data ? await verifyPassword(String(password), data.password_hash) : { valid: false, needsRehash: false };
    if (!data || !passwordCheck.valid) {
      return json({ error: "Usuário ou senha incorretos" }, 401, origin);
    }
    if (!data.is_active) {
      return json({ error: "Sua conta está desativada. Contate o administrador." }, 403, origin);
    }

    if (passwordCheck.needsRehash) {
      const passwordHash = await hashPassword(String(password));
      const now = new Date().toISOString();
      const { error: authUpdateError } = await supabase
        .from("maestro_collaborators")
        .update({ password_hash: passwordHash, source_updated_at: now })
        .eq("id", data.id);
      if (authUpdateError) throw authUpdateError;

      const { data: legacy, error: legacyReadError } = await supabase
        .from("legacy_records")
        .select("payload")
        .eq("entity", "Collaborator")
        .eq("record_id", data.id)
        .maybeSingle();
      if (legacyReadError) throw legacyReadError;
      if (legacy) {
        const { error: legacyUpdateError } = await supabase
          .from("legacy_records")
          .update({ payload: { ...(legacy.payload || {}), password_hash: passwordHash }, source_updated_at: now })
          .eq("entity", "Collaborator")
          .eq("record_id", data.id);
        if (legacyUpdateError) throw legacyUpdateError;
      }
    }

    const rawAccessLevel = String(data.profile?.access_level || "collaborator").toLowerCase();
    const accessLevel = rawAccessLevel === "admin" ? "master" : rawAccessLevel;
    const collaborator = { ...data.profile, access_level: accessLevel };
    const sessionToken = await signSession({
      sub: data.id,
      access_level: accessLevel,
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
    });

    return json({ success: true, collaborator, session_token: sessionToken }, 200, origin);
  } catch (error) {
    console.error("Collaborator login error:", error);
    return json({ error: "Erro ao autenticar. Tente novamente." }, 500, origin);
  }
});
