import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const handlerPath = new URL("../supabase/functions/maestro-core-data/index.ts", import.meta.url);
const handler = await readFile(handlerPath, "utf8");

assert.match(handler, /import \{ selectCoreWritePath \} from "\.\/core-write-path\.mjs"/);
const selectorIndex = handler.indexOf("const coreWritePath = selectCoreWritePath({ entity, operation, legacyWritesAllowed: allowed });");
const historyDispatchIndex = handler.indexOf('if (coreWritePath === "relational-history-rpc")');
const historyRpcIndex = handler.indexOf('db.rpc("maestro_write_frozen_core_with_history"', historyDispatchIndex);
const projectDispatchIndex = handler.indexOf('if (coreWritePath === "relational-upsert")');
const legacyDispatchIndex = handler.indexOf('db.rpc("maestro_apply_legacy_mutation_scoped"', projectDispatchIndex);

assert.ok(selectorIndex >= 0, "handler must select a write path from the cutover state");
assert.ok(historyDispatchIndex > selectorIndex, "Job/Subtask relational RPC must follow path selection");
assert.ok(historyRpcIndex > historyDispatchIndex, "Job/Subtask dispatch must call the relational history RPC");
assert.ok(projectDispatchIndex > historyRpcIndex, "Project dispatch must remain a separate relational upsert path");
assert.ok(handler.indexOf("await saveFrozen(entity, id, payload, org, now);", projectDispatchIndex) > projectDispatchIndex,
  "Project cutover path must upsert into its relational table");
assert.ok(legacyDispatchIndex > projectDispatchIndex, "legacy RPC must remain the fallback after relational paths");

console.log("Relational dispatch contract verified: Jobs/Subtasks → history RPC, Projects → frozen upsert, legacy RPC preserved as fallback.");
