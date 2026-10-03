import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { loadActiveProspectingManagerSession } from "./prospecting-authorization.mjs";

function makeSupabase({ collaborator, memberships, products }) {
  const productRows = products || [...new Set(memberships.map((membership) => membership.organization_id))]
    .map((organizationId) => ({ organization_id: organizationId, product_key: "maestro", status: "enabled" }));
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, filters: {} };
      queries.push(query);
      query.select = () => query;
      query.eq = (column, value) => {
        query.filters[column] = value;
        return query;
      };
      query.limit = () => query;
      query.maybeSingle = async () => ({ data: collaborator, error: null });
      query.then = (resolve, reject) => {
        const rows = table === "organization_members"
          ? memberships.filter((membership) =>
            membership.status === query.filters.status
            && membership.organizations?.status === query.filters["organizations.status"]
            && (!query.filters.organization_id || membership.organization_id === query.filters.organization_id)
            && (!query.filters.collaborator_id || membership.collaborator_id === query.filters.collaborator_id))
          : productRows.filter((product) => product.organization_id === query.filters.organization_id
            && product.product_key === query.filters.product_key);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      };
      return query;
    },
  };
}

const activeCollaborator = (accessLevel = "gestor", isActive = true) => ({
  id: "collaborator-1",
  is_active: isActive,
  profile: { access_level: accessLevel },
});
const activeMembership = (organizationId = "org-1", collaboratorId = "collaborator-1", role = "manager") => ({
  organization_id: organizationId,
  collaborator_id: collaboratorId,
  role,
  status: "active",
  organizations: { status: "active" },
});

test("uses current organization role rather than stale signed role claims", async () => {
  const client = makeSupabase({ collaborator: activeCollaborator("master"), memberships: [activeMembership("org-1", "collaborator-1", "member")] });
  const session = await loadActiveProspectingManagerSession(client, { sub: "collaborator-1", access_level: "master" });

  assert.equal(session, null);
});

test("uses the selected organization's active manager role", async () => {
  const client = makeSupabase({
    collaborator: activeCollaborator("collaborator"),
    memberships: [activeMembership("org-1", "collaborator-1", "manager")],
  });
  const session = await loadActiveProspectingManagerSession(client, { sub: "collaborator-1", organization_id: "org-1" });

  assert.equal(session?.access_level, "gestor");
  assert.equal(session?.organization_role, "manager");
});

test("rejects a disabled collaborator despite a valid signed session", async () => {
  const client = makeSupabase({ collaborator: activeCollaborator("gestor", false), memberships: [activeMembership()] });

  assert.equal(await loadActiveProspectingManagerSession(client, { sub: "collaborator-1" }), null);
  assert.equal(client.queries.some((query) => query.table === "organization_members"), false);
});

test("rejects a collaborator whose active organization membership was revoked", async () => {
  const revoked = { ...activeMembership(), status: "inactive" };
  const client = makeSupabase({ collaborator: activeCollaborator(), memberships: [revoked] });

  assert.equal(await loadActiveProspectingManagerSession(client, { sub: "collaborator-1" }), null);
});

test("requires an explicit organization when the collaborator has multiple memberships", async () => {
  const client = makeSupabase({
    collaborator: activeCollaborator(),
    memberships: [activeMembership("org-1"), activeMembership("org-2")],
  });

  assert.equal(await loadActiveProspectingManagerSession(client, { sub: "collaborator-1" }), null);
});

test("requires an active Maestro entitlement for the selected organization", async () => {
  const client = makeSupabase({
    collaborator: activeCollaborator(),
    memberships: [activeMembership()],
    products: [{
      organization_id: "org-1",
      product_key: "maestro",
      status: "enabled",
      expires_at: "2000-01-01T00:00:00.000Z",
    }],
  });

  assert.equal(await loadActiveProspectingManagerSession(client, { sub: "collaborator-1", organization_id: "org-1" }), null);
});

test("allows a current manager only in the organization selected by the signed session", async () => {
  const client = makeSupabase({
    collaborator: activeCollaborator(),
    memberships: [activeMembership("org-1"), activeMembership("org-2")],
  });
  const session = await loadActiveProspectingManagerSession(client, {
    sub: "collaborator-1",
    organization_id: "org-2",
    access_level: "gestor",
  });

  assert.equal(session?.organization_id, "org-2");
  assert.equal(session?.access_level, "gestor");
});

test("both prospecting Edge Functions use the live membership authorization helper", async () => {
  for (const functionName of ["google-places-search", "cnpj-enrich"]) {
    const source = await fs.readFile(new URL(`../${functionName}/index.ts`, import.meta.url), "utf8");
    assert.match(source, /loadActiveProspectingManagerSession/);
    assert.match(source, /await loadActiveProspectingManagerSession\(supabase, claims\)/);
  }
});
