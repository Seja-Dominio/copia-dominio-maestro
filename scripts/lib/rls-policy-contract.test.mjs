import test from "node:test";
import assert from "node:assert/strict";
import { validateRlsPolicyCatalog } from "./rls-policy-contract.mjs";

function rowsFor(table) {
  const tenant = "exists (select 1 from organization_members m where m.organization_id = target.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = 'active')";
  return [
    { table_name: table, rls_enabled: true },
    { table_name: table, policy_name: `${table}_org_select`, command: "SELECT", permissive: "PERMISSIVE", roles: ["authenticated"], using_expression: tenant },
    { table_name: table, policy_name: `${table}_org_insert`, command: "INSERT", permissive: "PERMISSIVE", roles: ["authenticated"], check_expression: tenant },
    { table_name: table, policy_name: `${table}_org_update`, command: "UPDATE", permissive: "PERMISSIVE", roles: ["authenticated"], using_expression: tenant, check_expression: tenant },
    { table_name: table, policy_name: `${table}_org_delete`, command: "DELETE", permissive: "PERMISSIVE", roles: ["authenticated"], using_expression: `${tenant} and m.role in ('master','gestor')` },
  ];
}

test("accepts four tenant-aware policies without direct client table privileges", () => {
  assert.deepEqual(validateRlsPolicyCatalog(["maestro_jobs"], rowsFor("maestro_jobs")), []);
});

test("fails closed when a table or tenant policy is missing", () => {
  const rows = rowsFor("maestro_jobs");
  rows.find((row) => row.command === "SELECT").policy_name = "maestro_jobs_public_select";
  assert.ok(validateRlsPolicyCatalog(["maestro_jobs", "maestro_notes"], rows).some((failure) => failure.includes("select_policy_missing")));
  assert.ok(validateRlsPolicyCatalog(["maestro_notes"], []).includes("maestro_notes:missing_relation"));
});

test("rejects widened client grants and an unguarded delete policy", () => {
  const rows = rowsFor("maestro_jobs");
  rows[0].authenticated_select = true;
  const del = rows.find((row) => row.command === "DELETE");
  del.using_expression = "exists (select 1 from organization_members where organization_id = target.organization_id and collaborator_id = auth.uid() and status = 'active')";
  rows.find((row) => row.command === "UPDATE").check_expression = "true";
  const failures = validateRlsPolicyCatalog(["maestro_jobs"], rows);
  assert.ok(failures.includes("maestro_jobs:authenticated_select_granted"));
  assert.ok(failures.includes("maestro_jobs:delete_manager_role_guard_missing"));
  assert.ok(failures.includes("maestro_jobs:update_check_tenant_predicate_missing_organization_members"));
});
