import test from "node:test";
import assert from "node:assert/strict";
import { verifyPolicyTargetOwnership } from "./policy-target-ownership.mjs";

const migrationSql = `do $$ declare table_name text; begin foreach table_name in array array['maestro_jobs','maestro_orphan'] loop null; end loop; end $$;`;
const registrySql = `insert into public.legacy_cutover_registry (entity,module_key,relational_table,read_mode) values ('Job','maestro','maestro_jobs','relational');`;
const ownership = { targets: [{ table: "maestro_orphan", product: "maestro", evidence: ["docs/map.md"] }] };

test("classifies every RLS target using registry or evidence-backed supplemental ownership", () => {
  const result = verifyPolicyTargetOwnership({ migrationSql, registrySql, supplementalTargets: ownership, evidenceExists: () => true });
  assert.equal(result.targetCount, 2);
  assert.equal(result.registryClassifiedCount, 1);
  assert.equal(result.supplementalClassifiedCount, 1);
  assert.deepEqual(result.owners, { maestro_jobs: "maestro", maestro_orphan: "maestro" });
});

test("fails when an RLS target is added without product ownership", () => {
  assert.throws(() => verifyPolicyTargetOwnership({
    migrationSql: migrationSql.replace("'maestro_orphan'", "'maestro_orphan','maestro_unmapped'"),
    registrySql,
    supplementalTargets: ownership,
  }), /Unclassified RLS migration targets: maestro_unmapped/);
});

test("fails if supplemental ownership has no evidence file", () => {
  assert.throws(() => verifyPolicyTargetOwnership({
    migrationSql,
    registrySql,
    supplementalTargets: ownership,
    evidenceExists: () => false,
  }), /Missing or invalid ownership evidence for maestro_orphan/);
});
