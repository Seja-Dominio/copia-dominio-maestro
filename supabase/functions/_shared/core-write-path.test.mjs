import test from "node:test";
import assert from "node:assert/strict";
import { selectCoreWritePath } from "../maestro-core-data/core-write-path.mjs";

test("cutover Jobs and subtasks use the relational RPC with history", () => {
  for (const entity of ["Job", "Subtask"]) {
    for (const operation of ["create", "update", "delete"]) {
      assert.equal(selectCoreWritePath({ entity, operation, legacyWritesAllowed: false }), "relational-history-rpc");
    }
  }
});

test("cutover project create and update use the relational upsert", () => {
  for (const operation of ["create", "update"]) {
    assert.equal(selectCoreWritePath({ entity: "Project", operation, legacyWritesAllowed: false }), "relational-upsert");
  }
});

test("legacy mode preserves the legacy RPC for Jobs and Projects", () => {
  for (const entity of ["Job", "Project"]) {
    for (const operation of ["create", "update"]) {
      assert.equal(selectCoreWritePath({ entity, operation, legacyWritesAllowed: true }), "legacy-rpc");
    }
  }
});

test("unrelated entities and project deletion are outside this dispatch", () => {
  assert.equal(selectCoreWritePath({ entity: "FinancialEntry", operation: "update", legacyWritesAllowed: false }), "not-applicable");
  assert.equal(selectCoreWritePath({ entity: "Project", operation: "delete", legacyWritesAllowed: false }), "not-applicable");
});
