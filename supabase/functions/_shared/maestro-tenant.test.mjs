import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  accessLevelForOrganizationRole,
  organizationRoleForAccessLevel,
  selectOrganizationMembership,
  selectUniqueGroupOrganization,
} from "./maestro-tenant.mjs";

const organizationA = {
  organization_id: "org-a",
  role: "manager",
  status: "active",
  organizations: { name: "Agency A", slug: "agency-a", status: "active" },
};
const organizationB = {
  organization_id: "org-b",
  role: "member",
  status: "active",
  organizations: { name: "Agency B", slug: "agency-b", status: "active" },
};

test("uses the only active organization without requiring a new login field", () => {
  assert.deepEqual(selectOrganizationMembership([organizationA]), {
    ok: true,
    membership: {
      organization_id: "org-a",
      organization_name: "Agency A",
      organization_slug: "agency-a",
      organization_role: "manager",
    },
  });
});

test("requires an explicit organization when the collaborator belongs to several", () => {
  const result = selectOrganizationMembership([organizationA, organizationB]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "organization_required");
  assert.deepEqual(result.organizations.map(({ organization_id }) => organization_id), ["org-a", "org-b"]);
});

test("accepts only a selected active membership and rejects cross-tenant selection", () => {
  assert.equal(selectOrganizationMembership([organizationA, organizationB], "org-b").membership.organization_id, "org-b");
  assert.deepEqual(selectOrganizationMembership([organizationA], "org-b"), {
    ok: false,
    reason: "not_a_member",
    organizations: [],
  });
  assert.equal(selectOrganizationMembership([{ ...organizationA, organizations: { status: "suspended" } }]).reason, "no_active_membership");
});

test("maps organization membership roles to existing Maestro authorization levels", () => {
  assert.equal(accessLevelForOrganizationRole("owner"), "master");
  assert.equal(accessLevelForOrganizationRole("admin"), "master");
  assert.equal(accessLevelForOrganizationRole("manager"), "gestor");
  assert.equal(accessLevelForOrganizationRole("viewer"), "viewer");
  assert.equal(accessLevelForOrganizationRole("member"), "collaborator");
  assert.equal(organizationRoleForAccessLevel("master"), "admin");
  assert.equal(organizationRoleForAccessLevel("gestor"), "manager");
  assert.equal(organizationRoleForAccessLevel("viewer"), "viewer");
  assert.equal(organizationRoleForAccessLevel("collaborator"), "member");
});

test("resolves group scope only when every matching directory row belongs to one organization", () => {
  assert.equal(selectUniqueGroupOrganization([{ organization_id: "org-a" }, { organization_id: "org-a" }]), "org-a");
  assert.equal(selectUniqueGroupOrganization([{ organization_id: "org-a" }, { organization_id: "org-b" }]), null);
  assert.equal(selectUniqueGroupOrganization([]), null);
});

test("the production data endpoint derives organization scope from active memberships", async () => {
  const source = await fs.readFile(new URL("../maestro-data/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /\.eq\("collaborator_id", session\.sub\)/);
  assert.match(source, /\.eq\("organizations\.status", "active"\)/);
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
});

test("legacy record reads and mutations in maestro-data are constrained to the session organization", async () => {
  const source = await fs.readFile(new URL("../maestro-data/index.ts", import.meta.url), "utf8");
  assert.match(source, /\.eq\("organization_id", organizationId\)/);
  assert.match(source, /\.eq\("organization_id", session\.organization_id\)/);
  assert.match(source, /organization_id: session\.organization_id,[\s\S]{0,140}payload: nextPayload/);
  assert.match(source, /organization_id: session\.organization_id,[\s\S]{0,140}payload, source_created_at/);
  assert.match(source, /\.eq\("record_id", recordId\)\s*\.eq\("organization_id", session\.organization_id\)/);
});

test("admin-timesheets authorizes master role from active membership and uses scoped atomic operations", async () => {
  const source = await fs.readFile(new URL("../admin-timesheets/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /selectOrganizationMembership\(memberships, session\.organization_id\)/);
  assert.match(source, /accessLevelForOrganizationRole\(choice\.membership\.organization_role\) !== "master"/);
  assert.match(source, /supabase\.rpc\(rpc, args\)/);
  assert.match(source, /"maestro_delete_timesheets_with_audit"/);
  assert.match(source, /"maestro_reset_running_timesheets"/);
  assert.match(source, /p_organization_id: actor\.session\.organization_id/g);
  assert.doesNotMatch(source, /from\("legacy_records"\)/);
});

test("Maestro AI validates organization membership and scopes every data source", async () => {
  const source = await fs.readFile(new URL("../maestro-ai/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /selectOrganizationMembership\(memberships, String\(payload\.organization_id \|\| ""\)\)/);
  assert.match(source, /organization_id: choice\.membership\.organization_id/);
  assert.match(source, /\.eq\("entity", entity\)\.eq\("organization_id", organizationId\)/);
  assert.match(source, /query = query\.eq\("organization_id", session\.organization_id\)/);
  assert.match(source, /organization_id: session\.organization_id,[\s\S]{0,100}payload:/);
  assert.match(source, /O cliente não pertence à organização ativa/);
});
