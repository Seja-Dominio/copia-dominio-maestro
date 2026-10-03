import { loadCurrentCollaboratorSession } from "./session-authorization.js";
import { accessLevelForOrganizationRole } from "./maestro-tenant.mjs";
import { hasActiveOrganizationProduct } from "./organization-products.mjs";

export async function loadActiveProspectingManagerSession(client, claims) {
  const session = await loadCurrentCollaboratorSession(client, claims);
  if (!session) return null;

  const { data: memberships, error } = await client
    .from("organization_members")
    .select("organization_id,role")
    .eq("organization_id", session.organization_id)
    .eq("collaborator_id", session.sub)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(2);
  if (error || memberships?.length !== 1) return null;

  const organizationRole = String(memberships[0].role || "member");
  const accessLevel = accessLevelForOrganizationRole(organizationRole);
  if (!["master", "gestor"].includes(accessLevel)) return null;

  const { data: products, error: productsError } = await client
    .from("organization_products")
    .select("product_key,status,expires_at")
    .eq("organization_id", session.organization_id)
    .eq("product_key", "maestro");
  if (productsError || !hasActiveOrganizationProduct(products, "maestro")) return null;

  return { ...session, organization_role: organizationRole, access_level: accessLevel };
}
