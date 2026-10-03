import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Maestro core entity operations route to the isolated handler without claiming a completed data cutover", async () => {
  const [supabaseClient, maestroClient, relationalEntities, coreData, disposition, functionalMap, router] = await Promise.all([
    read("../../src/api/supabaseClient.js"),
    read("../../src/api/maestroClient.js"),
    read("../config/relational-read-entities.json"),
    read("../../supabase/functions/maestro-core-data/index.ts"),
    read("../config/frontend-entity-dispositions.json"),
    read("../../docs/system-functional-map.md"),
    import("../../src/api/maestro-data-endpoint.mjs"),
  ]);
  const relationalReadList = JSON.parse(relationalEntities);
  const historyDisposition = JSON.parse(disposition).find((entry) => entry.entity === "JobHistory");

  assert.match(supabaseClient, /functions\/v1\/\$\{endpoint\}/);
  assert.match(supabaseClient, /create:\s*async\s*\(data\)\s*=>\s*\{\s*const result = await callMaestroData\(/);
  assert.ok(!relationalReadList.includes("JobHistory"));
  assert.match(coreData, /listRelationalJobHistoryRows\(db/);
  assert.match(coreData, /maestro_append_job_history_scoped/);
  assert.match(historyDisposition.source_of_truth, /Transição mista/);
  assert.match(functionalMap, /JobHistory` está em transição mista/);

  for (const entity of ["Project", "Job", "Subtask", "FinancialEntry", "JobHistory"]) {
    for (const operation of ["list", "filter"]) {
      assert.equal(router.resolveMaestroDataEndpoint({ entity, operation }), "maestro-core-data");
    }
  }
  for (const entity of ["Project", "Job", "Subtask", "FinancialEntry"]) {
    for (const operation of ["create", "update", "delete"]) {
      assert.equal(router.resolveMaestroDataEndpoint({ entity, operation }), "maestro-core-data");
    }
  }
  assert.equal(router.resolveMaestroDataEndpoint({ entity: "FinancialEntry", operation: "bulkCreate" }), "maestro-core-data");
  assert.equal(router.resolveMaestroDataEndpoint({ entity: "JobHistory", operation: "create" }), "maestro-core-data");
  assert.equal(router.resolveMaestroDataEndpoint({ entity: "JobHistory", operation: "delete" }), "maestro-data");
  assert.equal(router.resolveMaestroDataEndpoint({ entity: "Subtask", operation: "transferSubtasks" }), "maestro-data");
  assert.equal(router.resolveMaestroDataEndpoint({ entity: "Client", operation: "list" }), "maestro-data");
  assert.match(maestroClient, /transferSubtasksSupabase\(payload\)/);
});
