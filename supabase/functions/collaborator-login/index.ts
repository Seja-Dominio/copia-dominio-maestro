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

async function verifyPassword(password: string, storedHash: string) {
  // Senhas novas usam salt + SHA-256. Registros sem hash são rejeitados para
  // não manter autenticação baseada em texto puro.
  if (!storedHash.includes(":")) return false;

  const [saltHex, expectedHash] = storedHash.split(":");
  const data = new TextEncoder().encode(saltHex + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const actualHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return actualHash === expectedHash;
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
    if (!data || !(await verifyPassword(String(password), data.password_hash))) {
      return json({ error: "Usuário ou senha incorretos" }, 401, origin);
    }
    if (!data.is_active) {
      return json({ error: "Sua conta está desativada. Contate o administrador." }, 403, origin);
    }

    const sessionToken = await signSession({
      sub: data.id,
      access_level: data.profile.access_level || "collaborator",
      exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60),
    });

    return json({ success: true, collaborator: data.profile, session_token: sessionToken }, 200, origin);
  } catch (error) {
    console.error("Collaborator login error:", error);
    return json({ error: "Erro ao autenticar. Tente novamente." }, 500, origin);
  }
});
