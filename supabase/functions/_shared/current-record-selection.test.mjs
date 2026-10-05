import test from "node:test";
import assert from "node:assert/strict";
import { loadCurrentCoreRecord, selectCurrentCoreRecord } from "../maestro-core-data/current-record-selection.mjs";

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

test("frozen core entities query relational first and avoid legacy when found", async () => {
  const calls = [];
  const relationalRecord = { payload: { title: "canonical" } };
  const result = await loadCurrentCoreRecord({
    entity: "Job",
    legacyWritesAllowed: false,
    loadRelationalRecord: async () => { calls.push("relational"); return relationalRecord; },
    loadLegacyRecord: async () => { calls.push("legacy"); throw new Error("legacy should not be queried"); },
  });
  assert.equal(result, relationalRecord);
  assert.deepEqual(calls, ["relational"]);
});

test("frozen core entities use legacy only as a relational-miss fallback", async () => {
  const calls = [];
  const legacyRecord = { payload: { title: "fallback" } };
  const result = await loadCurrentCoreRecord({
    entity: "Project",
    legacyWritesAllowed: false,
    loadRelationalRecord: async () => { calls.push("relational"); return null; },
    loadLegacyRecord: async () => { calls.push("legacy"); return legacyRecord; },
  });
  assert.equal(result, legacyRecord);
  assert.deepEqual(calls, ["relational", "legacy"]);
});

test("legacy-write mode does not query relational source", async () => {
  const calls = [];
  const legacyRecord = { payload: { title: "legacy" } };
  const result = await loadCurrentCoreRecord({
    entity: "Job",
    legacyWritesAllowed: true,
    loadRelationalRecord: async () => { calls.push("relational"); return null; },
    loadLegacyRecord: async () => { calls.push("legacy"); return legacyRecord; },
  });
  assert.equal(result, legacyRecord);
  assert.deepEqual(calls, ["legacy"]);
});
