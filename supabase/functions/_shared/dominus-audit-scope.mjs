import { hasActiveOrganizationProduct } from "./organization-products.mjs";
import { accessLevelForOrganizationRole, selectOrganizationMembership } from "./maestro-tenant.mjs";

export function authorizeDominusAuditSession({ payload, collaborator, memberships, products, nowMs = Date.now() }) {
  const expiresAt = Number(payload?.exp);
  const organizationId = String(payload?.organization_id || "").trim();
  if (!payload?.sub || !organizationId || !Number.isFinite(expiresAt) || expiresAt <= Math.floor(nowMs / 1000)
    || !collaborator?.is_active || String(collaborator.id || "") !== String(payload.sub)) return null;

  const choice = selectOrganizationMembership(memberships, organizationId);
  if (!choice.ok || accessLevelForOrganizationRole(choice.membership.organization_role) !== "master") return null;
  if (!hasActiveOrganizationProduct(products, "maestro", nowMs)) return null;
  return {
    sub: String(payload.sub),
    exp: expiresAt,
    access_level: "master",
    organization_id: choice.membership.organization_id,
  };
}

export function selectScheduledAuditOrganization(organizations, products) {
  const active = [...new Set((Array.isArray(organizations) ? organizations : [])
    .filter((organization) => String(organization?.status || "") === "active")
    .map((organization) => String(organization?.id || "").trim())
    .filter(Boolean))];

  if (active.length !== 1) return { ok: false, reason: active.length ? "ambiguous_organizations" : "no_eligible_organization" };
  const organizationId = active[0];
  if (!hasActiveOrganizationProduct(
    (Array.isArray(products) ? products : []).filter((product) => String(product?.organization_id || "") === organizationId),
    "maestro",
  )) return { ok: false, reason: "no_eligible_organization" };
  return { ok: true, organization_id: organizationId };
}
