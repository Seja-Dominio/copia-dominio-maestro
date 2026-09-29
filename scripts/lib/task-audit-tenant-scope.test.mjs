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
  path.join(root, "scripts/sql/verify_atomic_project_financial_deletes.sql"),
  "utf8",
);

test("task and delete-log projection trusts row tenant before legacy mapping", () => {
  assert.match(migration, /v_org := new\.organization_id;[\s\S]*?from public\.organization_legacy_records/i);
  assert.doesNotMatch(migration, /order by created_at asc/i);
  assert.match(migration, /tenant scope required for % record %/i);
  assert.match(migration, /revoke execute on function public\.maestro_sync_task_audit_log\(\) from public, anon, authenticated/i);
});

test("rollback contract covers ambiguity rejection, tenant routing, and exact financial recovery image", () => {
  assert.match(sqlContract, /older tenant[\s\S]*now\(\) - interval '1 day'/i);
  assert.match(sqlContract, /unscoped task write was accepted/i);
  assert.match(sqlContract, /tenant scope required for MiniTask record %/i);
  assert.match(sqlContract, /where legacy_record_id=v_task and organization_id=v_org/i);
  assert.match(sqlContract, /v_deleted_payload is distinct from \(v_financial_payload \|\| jsonb_build_object\('id', v_entry\)\)/i);
  assert.match(sqlContract, /from public\.maestro_delete_logs[\s\S]*?deleted_payload=\(v_financial_payload/i);
  assert.match(sqlContract, /payload->'before'=\(v_financial_payload/i);
});
