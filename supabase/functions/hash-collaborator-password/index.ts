import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { accessLevelForOrganizationRole, selectOrganizationMembership } from "../_shared/maestro-tenant.mjs";
import { hasActiveOrganizationProduct } from "../_shared/organization-products.mjs";

type Session = { sub: string; exp: number; access_level?: string; organization_id?: string };

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
  if (!data?.is_active) return null;

  let membershipsQuery = supabase
    .from("organization_members")
    .select("organization_id, role, status, organizations!inner(status)")
    .eq("collaborator_id", session.sub)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(2);
  if (session.organization_id) membershipsQuery = membershipsQuery.eq("organization_id", session.organization_id);
  const { data: memberships, error: membershipError } = await membershipsQuery;
  if (membershipError) return null;
  const choice = selectOrganizationMembership(memberships, session.organization_id);
  if (!choice.ok) return null;
  return {
    ...session,
    organization_id: choice.membership.organization_id,
    access_level: accessLevelForOrganizationRole(choice.membership.organization_role),
  };
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

    const { collaboratorId, password, login } = await request.json();
    if (!collaboratorId || !password) {
      return json({ error: "collaboratorId e password são obrigatórios" }, 400, origin);
    }

    const organizationId = String(session.organization_id || "");
    if (session.access_level !== "master" || !organizationId) {
      return json({ error: "Apenas um administrador da organização ativa pode alterar credenciais." }, 403, origin);
    }

    const { data: products, error: productsError } = await supabase.from("organization_products")
      .select("product_key,status,expires_at")
      .eq("organization_id", organizationId)
      .eq("product_key", "maestro");
    if (productsError) throw productsError;
    if (!hasActiveOrganizationProduct(products, "maestro")) {
      return json({ error: "O produto Maestro não está habilitado para esta organização." }, 403, origin);
    }

    const { data: targetMembership, error: targetMembershipError } = await supabase
      .from("organization_members")
      .select("collaborator_id, status, organizations!inner(status)")
      .eq("organization_id", organizationId)
      .eq("collaborator_id", String(collaboratorId))
      .eq("status", "active")
      .eq("organizations.status", "active")
      .maybeSingle();
    if (targetMembershipError) throw targetMembershipError;
    if (!targetMembership) return json({ error: "Colaborador não encontrado nesta organização." }, 404, origin);

    const { data: current, error: currentError } = await supabase
      .from("maestro_collaborators")
      .select("login")
      .eq("id", collaboratorId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return json({ error: "Colaborador não encontrado" }, 404, origin);

    const hashedPassword = await hashPassword(String(password));
    const now = new Date().toISOString();

    const { error: authError } = await supabase
      .from("maestro_collaborators")
      .update({
        login: String(login ?? current.login ?? collaboratorId),
        password_hash: hashedPassword,
        source_updated_at: now,
      })
      .eq("id", collaboratorId);
    if (authError) throw authError;

    return json({ success: true }, 200, origin);
  } catch (error) {
    console.error("hashCollaboratorPassword error:", error);
    return json({ error: "Erro ao atualizar credenciais" }, 500, origin);
  }
});
