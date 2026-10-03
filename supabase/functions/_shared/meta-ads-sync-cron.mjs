import { canManageAdsBrain } from "./ads-brain-access.js";
import { profileForOrganizationRole, selectOrganizationMembership } from "./maestro-tenant.mjs";
import { hasActiveOrganizationProduct } from "./organization-products.mjs";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function encode(value) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signSession(collaboratorId, organizationId, sessionSecret, nowMs) {
  const payload = encode(JSON.stringify({
    sub: collaboratorId,
    organization_id: organizationId,
    exp: Math.floor(nowMs() / 1000) + 5 * 60,
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

function isAdsBrainManager(profile) {
  const permissions = profile?.permissions;
  const tabs = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? permissions.tabs
    : null;
  if (tabs && typeof tabs === "object" && !Array.isArray(tabs)
    && Object.prototype.hasOwnProperty.call(tabs, "AdsBrain")
    && tabs.AdsBrain !== true) return false;
  return canManageAdsBrain(profile);
}

async function findAdsBrainManager(supabase, organizationId) {
  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_members")
    .select("collaborator_id,role,status,organizations!inner(status)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .eq("organizations.status", "active");
  if (membershipsError) throw membershipsError;

  for (const membership of memberships || []) {
    const { data: collaborator, error } = await supabase
      .from("maestro_collaborators")
      .select("id,is_active,profile")
      .eq("id", membership.collaborator_id)
      .maybeSingle();
    if (error) throw error;
    const membershipChoice = selectOrganizationMembership([membership], organizationId);
    if (!membershipChoice.ok || !collaborator?.is_active) continue;
    const authorizedProfile = profileForOrganizationRole(
      collaborator.profile || {},
      membershipChoice.membership.organization_role,
    );
    if (isAdsBrainManager(authorizedProfile)) return String(collaborator.id);
  }
  return null;
}

export function createMetaAdsSyncCronHandler({
  supabase,
  projectUrl,
  serviceRoleKey,
  sessionSecret,
  fetchImpl = globalThis.fetch,
  nowMs = Date.now,
}) {
  return async function handleMetaAdsSyncCron(request) {
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
        supabase.from("organization_products").select("organization_id,product_key,status,expires_at").in("product_key", ["maestro", "ads_brain"]),
        supabase.from("organizations").select("id").eq("status", "active"),
      ]);
      if (accountsError || productsError || organizationsError) {
        throw accountsError || productsError || organizationsError;
      }

      const activeOrganizationIds = new Set((organizations || []).map((item) => String(item.id)));
      const productsByOrganization = new Map();
      for (const product of products || []) {
        const organizationId = String(product.organization_id || "");
        if (!organizationId) continue;
        const rows = productsByOrganization.get(organizationId) || [];
        rows.push(product);
        productsByOrganization.set(organizationId, rows);
      }
      const enabledProductOrganizations = new Set([...productsByOrganization]
        .filter(([, rows]) => hasActiveOrganizationProduct(rows, "maestro", nowMs())
          || hasActiveOrganizationProduct(rows, "ads_brain", nowMs()))
        .map(([organizationId]) => organizationId));
      const organizationIds = [...new Set((accounts || [])
        .map((item) => String(item.organization_id || ""))
        .filter((id) => id && activeOrganizationIds.has(id) && enabledProductOrganizations.has(id)))];

      const results = [];
      for (const organizationId of organizationIds) {
        const collaboratorId = await findAdsBrainManager(supabase, organizationId);
        if (!collaboratorId) {
          results.push({ organization_id: organizationId, status: "skipped", reason: "no_active_manager" });
          continue;
        }

        const authorization = await signSession(collaboratorId, organizationId, sessionSecret, nowMs);
        let response;
        try {
          response = await fetchImpl(`${projectUrl.replace(/\/+$/, "")}/functions/v1/meta-ads-oauth`, {
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
        const failedAccounts = accountResults.filter((item) => Boolean(item.error)).length;
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
  };
}
