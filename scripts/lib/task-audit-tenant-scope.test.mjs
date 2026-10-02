import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const migration = await fs.readFile(
  path.join(root, "supabase/migrations/20260929220702_task_audit_log_scope_from_row_org_id.sql"),
  "utf8",
);
const sqlContract = await fs.readFile(
  path.join(root, "scripts/sql/verify_task_audit_tenant_scope.sql"),
  "utf8",
);
const financialSqlContract = await fs.readFile(
  path.join(root, "scripts/sql/verify_atomic_project_financial_deletes.sql"),
  "utf8",
);
const projectSqlContract = await fs.readFile(
  path.join(root, "scripts/sql/verify_atomic_project_delete.sql"),
  "utf8",
);

test("task and delete-log projection trusts row tenant before legacy mapping", () => {
  assert.match(migration, /v_org := new\.organization_id;[\s\S]*?from public\.organization_legacy_records/i);
  assert.doesNotMatch(migration, /order by created_at asc/i);
  assert.match(migration, /tenant scope required for % record %/i);
  assert.match(migration, /revoke execute on function public\.maestro_sync_task_audit_log\(\) from public, anon, authenticated/i);
});

test("rollback contract covers ambiguity rejection and tenant-routed task projection", () => {
  assert.match(sqlContract, /TEST_PREREQUISITE task-audit projection schema or trigger is not installed/i);
  assert.match(sqlContract, /set local role service_role/i);
  assert.match(sqlContract, /older tenant[\s\S]*now\(\) - interval '1 day'/i);
  assert.match(sqlContract, /unscoped task write was accepted/i);
  assert.match(sqlContract, /tenant scope required for MiniTask record %/i);
  assert.match(sqlContract, /where legacy_record_id=v_task and organization_id=v_org/i);
});

test("financial recovery fixture remains independent from optional task-audit schema", () => {
  assert.doesNotMatch(financialSqlContract, /MiniTask|maestro_mini_tasks/i);
  assert.doesNotMatch(financialSqlContract, /maestro_projects|maestro_apply_legacy_mutation_scoped/i);
  assert.match(financialSqlContract, /set local role service_role/i);
  assert.match(financialSqlContract, /TEST_PREREQUISITE client\/financial-entry\/delete-log projection schema or financial delete RPC is not installed/i);
  assert.match(financialSqlContract, /'Client',[\s\S]*?'FinancialEntry'/i);
  assert.match(financialSqlContract, /v_deleted_payload is distinct from \(v_financial_payload \|\| jsonb_build_object\('id', v_entry\)\)/i);
  assert.match(financialSqlContract, /from public\.maestro_delete_logs[\s\S]*?deleted_payload=\(v_financial_payload/i);
  assert.match(financialSqlContract, /payload->'before'=\(v_financial_payload/i);
});

test("scoped project delete fixture has an independent preflight and audit assertion", () => {
  assert.match(projectSqlContract, /TEST_PREREQUISITE scoped project delete contract is not installed/i);
  assert.match(projectSqlContract, /set local role service_role/i);
  assert.match(projectSqlContract, /maestro_apply_legacy_mutation_scoped[\s\S]*?SystemAuditLog/i);
  assert.match(projectSqlContract, /ROLLBACK;/i);
});
