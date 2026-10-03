import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const isDevelopmentProject = Deno.env.get("SUPABASE_URL") === "https://tqmfuskvllpqmvayjuqu.supabase.co";
const allowedOrigins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
  "http://localhost:4174",
  ...(isDevelopmentProject ? ["http://127.0.0.1:4175", "http://localhost:4175", "http://127.0.0.1:4177", "http://localhost:4177", "http://127.0.0.1:4178", "http://localhost:4178"] : []),
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://dominiomaestro.com.br",
]);

type Session = { sub: string; exp: number; access_level?: string; scope?: string; organization_id?: string; organization_role?: string; products?: string[] };

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

async function verifySession(token: string): Promise<Session | null> {
  if (!sessionSecret) return null;
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
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000) || session.scope === "group") return null;
  return session;
}

async function signSession(session: Session, accessLevel: string) {
  const body = encode(JSON.stringify({
    sub: session.sub,
    access_level: accessLevel,
    organization_id: session.organization_id,
    organization_role: session.organization_role,
    products: session.products,
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  }));
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

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }

  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
    const session = await verifySession(token);
    if (!session) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada" }), {
        status: 401,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("maestro_collaborators")
      .select("id, is_active, profile")
      .eq("id", session.sub)
      .maybeSingle();
    if (error) throw error;
    if (!data?.is_active) {
      return new Response(JSON.stringify({ error: "Conta inativa" }), {
        status: 403,
        headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
      });
    }

    let membershipsQuery = supabase.from("organization_members").select("organization_id,role,organizations!inner(status)").eq("collaborator_id", data.id).eq("status", "active").eq("organizations.status", "active").limit(2);
    if (session.organization_id) membershipsQuery = membershipsQuery.eq("organization_id", session.organization_id);
    const { data: memberships } = await membershipsQuery;
    if (!memberships || memberships.length !== 1) return new Response(JSON.stringify({ error: "Selecione uma organização novamente" }), { status: 409, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
    const organizationId = String(memberships[0].organization_id);
    const { data: products } = await supabase.from("organization_products").select("product_key").eq("organization_id", organizationId).in("status", ["trial", "enabled"]);
    const scopedSession = { ...session, organization_id: organizationId, organization_role: String(memberships[0].role || "member"), products: (products || []).map((product) => String(product.product_key)) };

    const rawAccessLevel = String(data.profile?.access_level || "collaborator").toLowerCase();
    const accessLevel = rawAccessLevel === "admin" ? "master" : rawAccessLevel;
    const sessionToken = await signSession(scopedSession, accessLevel);
    return new Response(JSON.stringify({ session_token: sessionToken }), {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Collaborator session refresh error:", error);
    return new Response(JSON.stringify({ error: "Não foi possível renovar a sessão" }), {
      status: 500,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
    });
  }
});
