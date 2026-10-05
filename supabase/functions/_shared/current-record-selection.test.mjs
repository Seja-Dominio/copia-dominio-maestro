import test from "node:test";
import assert from "node:assert/strict";
import { selectCurrentCoreRecord } from "../maestro-core-data/current-record-selection.mjs";

test("frozen core entities use relational values when both sources exist", () => {
  const legacyRecord = { payload: { title: "stale legacy" } };
  const relationalRecord = { payload: { title: "current relational" } };

  for (const entity of ["Project", "Job", "Subtask"]) {
    assert.equal(selectCurrentCoreRecord({ entity, legacyWritesAllowed: false, legacyRecord, relationalRecord }), relationalRecord);
  }
});

test("frozen core entities fall back to legacy when the relational row is absent", () => {
  const legacyRecord = { payload: { title: "legacy fallback" } };
  assert.equal(selectCurrentCoreRecord({ entity: "Job", legacyWritesAllowed: false, legacyRecord, relationalRecord: null }), legacyRecord);
});

test("legacy remains preferred while legacy writes are enabled", () => {
  const legacyRecord = { payload: { title: "legacy source" } };
  const relationalRecord = { payload: { title: "relational projection" } };
  assert.equal(selectCurrentCoreRecord({ entity: "Job", legacyWritesAllowed: true, legacyRecord, relationalRecord }), legacyRecord);
});

test("relational-only records remain available for updates after cutover", () => {
  const relationalRecord = { payload: { title: "relational-only" } };
  assert.equal(selectCurrentCoreRecord({ entity: "Job", legacyWritesAllowed: false, legacyRecord: null, relationalRecord }), relationalRecord);
});
