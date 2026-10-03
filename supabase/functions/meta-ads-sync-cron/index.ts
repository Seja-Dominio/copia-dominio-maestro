import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const supabase = createClient(projectUrl, serviceRoleKey);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function encode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signSession(collaboratorId: string, organizationId: string) {
  const payload = encode(JSON.stringify({
    sub: collaboratorId,
    organization_id: organizationId,
    exp: Math.floor(Date.now() / 1000) + 5 * 60,
  }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${encode(String.fromCharCode(...new Uint8Array(signature)))}`;
}

function isAdsBrainManager(profile: Record<string, unknown> | null) {
  const level = String(profile?.access_level || "collaborator").toLowerCase();
  const permissions = profile?.permissions;
  const tabs = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? (permissions as Record<string, unknown>).tabs
    : null;
  if (tabs && typeof tabs === "object" && !Array.isArray(tabs)
    && Object.prototype.hasOwnProperty.call(tabs, "AdsBrain")
    && (tabs as Record<string, unknown>).AdsBrain !== true) return false;
  return ["master", "admin", "gestor"].includes(level);
}

async function findAdsBrainManager(organizationId: string) {
  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("collaborator_id")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (membershipsError) throw membershipsError;

  for (const membership of memberships || []) {
    const { data: collaborator, error } = await supabase
      .from("maestro_collaborators")
      .select("id,is_active,profile")
      .eq("id", membership.collaborator_id)
      .maybeSingle();
    if (error) throw error;
    if (collaborator?.is_active && isAdsBrainManager(collaborator.profile)) return String(collaborator.id);
  }
  return null;
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);
    if (!projectUrl || !serviceRoleKey || !sessionSecret) {
      return json({ error: "Configuração interna incompleta para a sincronização automática." }, 503);
    }

    const presentedSecret = request.headers.get("x-maestro-cron-secret") || "";
    if (!presentedSecret) return json({ error: "Não autorizado" }, 401);
    const { data: authorized, error: authorizationError } = await supabase.rpc(
      "meta_ads_sync_cron_authorized",
      { p_secret: presentedSecret },
    );
    if (authorizationError || authorized !== true) return json({ error: "Não autorizado" }, 401);

    const [{ data: accounts, error: accountsError }, { data: products, error: productsError }, { data: organizations, error: organizationsError }] = await Promise.all([
      supabase.from("maestro_ads_accounts").select("organization_id").eq("network", "Meta Ads"),
      supabase.from("organization_products").select("organization_id,product_key").in("product_key", ["maestro", "ads_brain"]).in("status", ["trial", "enabled"]),
      supabase.from("organizations").select("id").eq("status", "active"),
    ]);
    if (accountsError || productsError || organizationsError) {
      throw accountsError || productsError || organizationsError;
    }

    const activeOrganizationIds = new Set((organizations || []).map((item) => String(item.id)));
    const enabledProductOrganizations = new Set((products || []).map((item) => String(item.organization_id)));
    const organizationIds = [...new Set((accounts || [])
      .map((item) => String(item.organization_id || ""))
      .filter((id) => id && activeOrganizationIds.has(id) && enabledProductOrganizations.has(id)))];

    const results = [];
    for (const organizationId of organizationIds) {
      const collaboratorId = await findAdsBrainManager(organizationId);
      if (!collaboratorId) {
        results.push({ organization_id: organizationId, status: "skipped", reason: "no_active_manager" });
        continue;
      }

      const authorization = await signSession(collaboratorId, organizationId);
      let response: Response;
      try {
        response = await fetch(`${projectUrl.replace(/\/+$/, "")}/functions/v1/meta-ads-oauth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceRoleKey,
            Authorization: `Bearer ${authorization}`,
          },
          body: JSON.stringify({ action: "sync", period: "Este mês", source: "automatic" }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch {
        results.push({ organization_id: organizationId, status: "error", reason: "sync_request_failed" });
        continue;
      }

      if (!response.ok) {
        results.push({ organization_id: organizationId, status: "error", http_status: response.status });
        continue;
      }
      const payload = await response.json().catch(() => ({}));
      const accountResults = Array.isArray(payload.results) ? payload.results : [];
      const failedAccounts = accountResults.filter((item: Record<string, unknown>) => Boolean(item.error)).length;
      results.push({
        organization_id: organizationId,
        status: failedAccounts ? "partial" : "ok",
        synced_accounts: Number(payload.synced || 0),
        failed_accounts: failedAccounts,
      });
    }

    const failed = results.filter((result) => result.status === "error" || result.status === "partial").length;
    console.log("Ads Brain scheduled sync completed", { organizations: results.length, failed_organizations: failed });
    return json({ status: failed ? "partial" : "ok", results });
  } catch (error) {
    console.error("Ads Brain scheduled sync failed", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Falha na sincronização automática do Ads Brain." }, 500);
  }
});
