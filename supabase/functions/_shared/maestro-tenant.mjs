const ACTIVE_ORGANIZATION_STATUSES = new Set(["active"]);

function organizationFromMembership(row) {
  const relation = Array.isArray(row?.organizations) ? row.organizations[0] : row?.organizations;
  const organizationId = String(row?.organization_id || "").trim();
  if (!organizationId || row?.status !== "active" || !ACTIVE_ORGANIZATION_STATUSES.has(String(relation?.status || ""))) {
    return null;
  }

  return {
    organization_id: organizationId,
    organization_name: String(relation?.name || ""),
    organization_slug: String(relation?.slug || ""),
    organization_role: String(row?.role || "member"),
  };
}

export function selectOrganizationMembership(memberships, requestedOrganizationId = "") {
  const active = (Array.isArray(memberships) ? memberships : [])
    .map(organizationFromMembership)
    .filter(Boolean);
  const requested = String(requestedOrganizationId || "").trim();

  if (requested) {
    const selected = active.find((membership) => membership.organization_id === requested);
    return selected
      ? { ok: true, membership: selected }
      : { ok: false, reason: "not_a_member", organizations: [] };
  }

  if (active.length === 1) return { ok: true, membership: active[0] };
  if (active.length === 0) return { ok: false, reason: "no_active_membership", organizations: [] };
  return {
    ok: false,
    reason: "organization_required",
    organizations: active.map(({ organization_id, organization_name, organization_slug }) => ({
      organization_id,
      organization_name,
      organization_slug,
    })),
  };
}

export function accessLevelForOrganizationRole(role) {
  switch (String(role || "").toLowerCase()) {
    case "owner":
    case "admin":
      return "master";
    case "manager":
      return "gestor";
    case "viewer":
      return "viewer";
    default:
      return "collaborator";
  }
}

export function profileForOrganizationRole(profile, role) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  return {
    ...source,
    access_level: accessLevelForOrganizationRole(role),
  };
}

export function organizationRoleForAccessLevel(accessLevel) {
  switch (String(accessLevel || "").toLowerCase()) {
    case "master":
    case "admin":
      return "admin";
    case "gestor":
    case "manager":
      return "manager";
    case "viewer":
    case "visualizador":
      return "viewer";
    default:
      return "member";
  }
}

export function selectUniqueGroupOrganization(groups) {
  const organizations = [...new Set((Array.isArray(groups) ? groups : [])
    .map((group) => String(group?.organization_id || "").trim())
    .filter(Boolean))];
  return organizations.length === 1 ? organizations[0] : null;
}
