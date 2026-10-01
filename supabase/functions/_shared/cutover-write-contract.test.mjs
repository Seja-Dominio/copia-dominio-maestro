import test from "node:test";
import assert from "node:assert/strict";
import { getCutoverWritePlan, isFrozenRelationalSource } from "./cutover-write-contract.mjs";

const frozen = {
  status: "frozen",
  write_mode: "relational",
  legacy_write_allowed: false,
};

test("frozen relational core entities resolve to dedicated writers", () => {
  assert.deepEqual(getCutoverWritePlan(frozen, "Project", "update"), { mode: "relational", writer: "project-rpc" });
  assert.deepEqual(getCutoverWritePlan(frozen, "Job", "delete"), { mode: "relational", writer: "core-history-rpc" });
  assert.deepEqual(getCutoverWritePlan(frozen, "Subtask", "create"), { mode: "relational", writer: "core-history-rpc" });
  assert.deepEqual(getCutoverWritePlan(frozen, "FinancialEntry", "bulkCreate"), { mode: "relational", writer: "financial-rpc" });
});

test("unavailable operations on frozen relational entities fail closed", () => {
  assert.equal(getCutoverWritePlan(frozen, "Project", "bulkCreate").mode, "unsupported");
  assert.equal(getCutoverWritePlan(frozen, "Client", "update").mode, "unsupported");
  assert.equal(getCutoverWritePlan({ ...frozen, legacy_write_allowed: true }, "Subtask", "update").mode, "unsupported");
  assert.equal(getCutoverWritePlan({ ...frozen, status: "retired" }, "Subtask", "update").mode, "unsupported");
});

test("non-frozen and dual-write entities preserve the legacy compatibility path", () => {
  assert.deepEqual(getCutoverWritePlan({ ...frozen, status: "candidate", legacy_write_allowed: true }, "Subtask", "update"), { mode: "legacy" });
  assert.deepEqual(getCutoverWritePlan({ ...frozen, status: "candidate", write_mode: "dual", legacy_write_allowed: true }, "Subtask", "update"), { mode: "legacy" });
});

test("only frozen relational entities with legacy writes disabled use directional parity", () => {
  assert.equal(isFrozenRelationalSource(frozen), true);
  assert.equal(isFrozenRelationalSource({ ...frozen, legacy_write_allowed: true }), false);
  assert.equal(isFrozenRelationalSource({ ...frozen, status: "candidate" }), false);
  assert.equal(isFrozenRelationalSource({ ...frozen, write_mode: "dual" }), false);
});

test("read operations are not rejected by write-plan availability", () => {
  assert.deepEqual(getCutoverWritePlan({ ...frozen, status: "retired" }, "Subtask", "list"), { mode: "read" });
  assert.deepEqual(getCutoverWritePlan(frozen, "Project", "filter"), { mode: "read" });
  assert.deepEqual(getCutoverWritePlan(frozen, "Subtask", "transferSubtasks"), { mode: "relational", writer: "task-transfer-rpc" });
});
