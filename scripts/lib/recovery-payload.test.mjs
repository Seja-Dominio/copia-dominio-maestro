import test from "node:test";
import assert from "node:assert/strict";
import { prepareRecoveryPayload } from "../../src/lib/recoveryPayload.mjs";

test("Job recovery preserves the original tenant-stable ID", () => {
  const payload = prepareRecoveryPayload({
    entity_id: "original-job-id",
    entity_data: {
      id: "original-job-id",
      title: "Recoverable Job",
      created_date: "old-created-date",
    },
  }, "Job");

  assert.equal(payload.id, "original-job-id");
  assert.equal(payload.title, "Recoverable Job");
  assert.equal("created_date" in payload, false);
});

test("Job recovery uses the logged ID when the snapshot omitted it", () => {
  assert.equal(prepareRecoveryPayload({ entity_id: "logged-job-id", entity_data: { title: "Job" } }, "Job").id, "logged-job-id");
});

test("Job recovery rejects a mismatch between the log and snapshot IDs", () => {
  assert.throws(
    () => prepareRecoveryPayload({ entity_id: "logged-id", entity_data: { id: "different-id" } }, "Job"),
    /ID do Job não confere/,
  );
});

test("non-Job recovery continues to generate a fresh ID", () => {
  const payload = prepareRecoveryPayload({ entity_id: "old-task-id", entity_data: { id: "old-task-id", title: "Task" } }, "Subtask");
  assert.equal("id" in payload, false);
  assert.equal(payload.title, "Task");
});
