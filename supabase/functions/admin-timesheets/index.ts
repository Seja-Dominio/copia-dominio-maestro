import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { accessLevelForOrganizationRole, selectOrganizationMembership } from "../_shared/maestro-tenant.mjs";
import { hasActiveOrganizationProduct } from "../_shared/organization-products.mjs";

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

type Session = { sub: string; exp: number; organization_id?: string };

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function getAdminSession(token: string): Promise<{ session: Session & { organization_id: string }; collaborator: Record<string, unknown> } | null> {
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

  let session: Session;
  try {
    session = JSON.parse(decode(body)) as Session;
  } catch {
    return null;
  }
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;

  const { data, error } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active, profile")
    .eq("id", session.sub)
    .maybeSingle();
  if (error || !data?.is_active) return null;

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
  if (!choice.ok || accessLevelForOrganizationRole(choice.membership.organization_role) !== "master") return null;
  const { data: products, error: productsError } = await supabase.from("organization_products")
    .select("product_key,status,expires_at")
    .eq("organization_id", choice.membership.organization_id)
    .eq("product_key", "maestro");
  if (productsError || !hasActiveOrganizationProduct(products, "maestro")) return null;
  return {
    session: { ...session, organization_id: choice.membership.organization_id },
    collaborator: data.profile || {},
  };
}

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function runTimesheetOperation(
  rpc: "maestro_delete_timesheets_with_audit" | "maestro_reset_running_timesheets",
  args: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) throw error;
  return Number(data || 0);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const actor = token ? await getAdminSession(token) : null;
    if (!actor) return json({ error: "Acesso administrativo necessário" }, 403, origin);

    const body = await request.json();
    const action = String(body.action || "");

    if (action === "delete") {
      const id = String(body.timesheetId || body.id || "");
      if (!id) return json({ error: "timesheetId obrigatório" }, 400, origin);
      const deletedCount = await runTimesheetOperation("maestro_delete_timesheets_with_audit", {
        p_organization_id: actor.session.organization_id,
        p_record_ids: [id],
        p_actor_id: actor.session.sub,
        p_actor_name: String(actor.collaborator.name || actor.collaborator.full_name || "Master"),
        p_reason: "",
      });
      return deletedCount > 0
        ? json({ success: true, message: "Timesheet excluído e registrado" }, 200, origin)
        : json({ error: "Timesheet não encontrado" }, 404, origin);
    }

    if (action === "clear") {
      const deletedCount = await runTimesheetOperation("maestro_delete_timesheets_with_audit", {
        p_organization_id: actor.session.organization_id,
        p_record_ids: null,
        p_actor_id: actor.session.sub,
        p_actor_name: String(actor.collaborator.name || actor.collaborator.full_name || "Master"),
        p_reason: "Limpeza em massa do sistema",
      });
      return json({ success: true, deletedCount, message: `${deletedCount} timesheets excluídos e registrados` }, 200, origin);
    }

    if (action === "reset") {
      const stopped = await runTimesheetOperation("maestro_reset_running_timesheets", {
        p_organization_id: actor.session.organization_id,
      });
      return json({ success: true, stopped }, 200, origin);
    }

    return json({ error: "Ação não suportada" }, 400, origin);
  } catch (error) {
    console.error("Admin timesheets error:", error);
    return json({ error: "Erro ao processar a operação administrativa" }, 500, origin);
  }
});
