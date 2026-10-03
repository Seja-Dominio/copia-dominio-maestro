import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { authorizeDominusAuditSession, selectScheduledAuditOrganization } from "./dominus-audit-scope.mjs";

const validLoginTokenPayload = {
  sub: "collaborator-1",
  access_level: "master",
  organization_id: "org-a",
  exp: 1_800_000_000,
};
const activeMasterMembership = {
  organization_id: "org-a",
  role: "admin",
  status: "active",
  organizations: { status: "active" },
};

test("authorizes the actual collaborator-login token shape from current membership", () => {
  assert.deepEqual(authorizeDominusAuditSession({
    payload: validLoginTokenPayload,
    collaborator: { id: "collaborator-1", is_active: true },
    memberships: [activeMasterMembership],
    products: [{ product_key: "maestro", status: "enabled" }],
    nowMs: 1_700_000_000_000,
  }), {
    sub: "collaborator-1",
    exp: validLoginTokenPayload.exp,
    access_level: "master",
    organization_id: "org-a",
  });
});

test("rejects expired, inactive, revoked, insufficient-role, cross-tenant and unentitled sessions", () => {
  const base = {
    payload: validLoginTokenPayload,
    collaborator: { id: "collaborator-1", is_active: true },
    memberships: [activeMasterMembership],
    products: [{ product_key: "maestro", status: "enabled" }],
    nowMs: 1_700_000_000_000,
  };
  assert.equal(authorizeDominusAuditSession({ ...base, payload: { ...base.payload, exp: 1 } }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, collaborator: { is_active: false } }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, collaborator: { id: "collaborator-2", is_active: true } }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, memberships: [{ ...activeMasterMembership, status: "revoked" }] }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, memberships: [{ ...activeMasterMembership, role: "manager" }] }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, memberships: [{ ...activeMasterMembership, organization_id: "org-b" }] }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, products: [{ product_key: "maestro", status: "cancelled" }] }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, products: [{ product_key: "cxm", status: "enabled" }] }), null);
  assert.equal(authorizeDominusAuditSession({ ...base, payload: { ...base.payload, organization_id: undefined } }), null);
});

test("scheduled Dominus audit selects the sole active Maestro organization", () => {
  assert.deepEqual(selectScheduledAuditOrganization(
    [{ id: "org-a", status: "active" }, { id: "org-b", status: "suspended" }],
    [{ organization_id: "org-a", product_key: "maestro", status: "enabled" }],
  ), { ok: true, organization_id: "org-a" });
});

test("scheduled Dominus audit fails closed when no unique active Maestro organization exists", () => {
  const organizations = [{ id: "org-a", status: "active" }, { id: "org-b", status: "active" }];
  assert.deepEqual(selectScheduledAuditOrganization(organizations, []), { ok: false, reason: "ambiguous_organizations" });
  assert.deepEqual(selectScheduledAuditOrganization(organizations, [
    { organization_id: "org-a", product_key: "maestro", status: "enabled" },
    { organization_id: "org-b", product_key: "maestro", status: "trial" },
  ]), { ok: false, reason: "ambiguous_organizations" });
  assert.deepEqual(selectScheduledAuditOrganization(organizations, [
    { organization_id: "org-a", product_key: "cxm", status: "enabled" },
    { organization_id: "org-b", product_key: "maestro", status: "cancelled" },
  ]), { ok: false, reason: "ambiguous_organizations" });
  assert.deepEqual(selectScheduledAuditOrganization([{ id: "org-a", status: "active" }], []), { ok: false, reason: "no_eligible_organization" });
});

test("Dominus audit validates current membership and scopes every tenant-owned read and write", async () => {
  const source = await fs.readFile(new URL("../dominus-audit/index.ts", import.meta.url), "utf8");
  const loginSource = await fs.readFile(new URL("../collaborator-login/index.ts", import.meta.url), "utf8");
  const refreshSource = await fs.readFile(new URL("../collaborator-session-refresh/index.ts", import.meta.url), "utf8");
  assert.match(loginSource, /organization_id: membership\.organization_id,[\s\S]*?exp: Math\.floor/);
  assert.match(refreshSource, /organization_id: session\.organization_id,[\s\S]*?organization_role: session\.organization_role/);
  assert.match(source, /from\("organization_members"\)/);
  assert.match(source, /authorizeDominusAuditSession\(\{ payload, collaborator: data, memberships, products \}\)/);
  assert.match(source, /\.eq\("organization_id", String\(payload\.organization_id\)\)/);
  assert.match(source, /\.eq\("product_key", "maestro"\)/);
  assert.match(source, /\.eq\("organization_id", organizationId\)/);
  assert.match(source, /organization_id: organizationId,[\s\S]*?triggered_by: triggeredBy/);
  assert.match(source, /dominus_audit_findings[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /dominus_learning_reviews[\s\S]*?\.eq\("organization_id", organizationId\)/);
  assert.match(source, /dominus_learning_review_events[\s\S]*?organization_id: organizationId/);
  assert.match(source, /organization_legacy_records[\s\S]*?legacy_entity: "DominusAuditSummary"[\s\S]*?organization_id: organizationId/);
  assert.match(source, /const summaryRecordId = `daily:\$\{organizationId\}:\$\{today\}`/);
  assert.match(source, /listAudits\(organizationId: string, runId = ""\)[\s\S]*?\.eq\("organization_id", organizationId\)/);
});
