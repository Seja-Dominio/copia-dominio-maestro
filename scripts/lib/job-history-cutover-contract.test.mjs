import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("JobHistory stays legacy-backed until its relational endpoint is wired into the frontend", async () => {
  const [supabaseClient, maestroClient, relationalEntities, coreData, disposition, functionalMap] = await Promise.all([
    read("../../src/api/supabaseClient.js"),
    read("../../src/api/maestroClient.js"),
    read("../config/relational-read-entities.json"),
    read("../../supabase/functions/maestro-core-data/index.ts"),
    read("../config/frontend-entity-dispositions.json"),
    read("../../docs/system-functional-map.md"),
  ]);
  const relationalReadList = JSON.parse(relationalEntities);
  const historyDisposition = JSON.parse(disposition).find((entry) => entry.entity === "JobHistory");

  assert.match(supabaseClient, /functions\/v1\/maestro-data/);
  assert.match(supabaseClient, /create:\s*async\s*\(data\)\s*=>\s*\{\s*const result = await callMaestroData\(/);
  assert.ok(!relationalReadList.includes("JobHistory"));
  assert.doesNotMatch(maestroClient, /maestro-core-data/);
  assert.match(coreData, /listRelationalJobHistoryRows\(db/);
  assert.match(coreData, /maestro_append_job_history_scoped/);
  assert.match(historyDisposition.source_of_truth, /Transição mista/);
  assert.match(functionalMap, /JobHistory` está em transição mista/);
});
