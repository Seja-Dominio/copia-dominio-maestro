import test from "node:test";
import assert from "node:assert/strict";
import { buildSafeEdgeErrorContext } from "./safe-edge-error-context.mjs";

test("safe edge error context includes allowlisted metadata but never exception text or payload", () => {
  const error = Object.assign(new Error("private customer name; secret=do-not-log; SQL detail"), { code: "23505" });
  const context = buildSafeEdgeErrorContext({
    requestId: "request-123",
    method: "POST",
    operation: "update",
    entity: "Job",
    stage: "handle",
    status: 500,
    error,
  });
  const serialized = JSON.stringify(context);

  assert.deepEqual(context, {
    event: "maestro_core_data_error",
    request_id: "request-123",
    method: "POST",
    stage: "handle",
    operation: "update",
    entity: "Job",
    status: 500,
    error_name: "Error",
    error_code: "23505",
  });
  assert.doesNotMatch(serialized, /private customer|do-not-log|SQL detail/);
});

test("safe edge error context rejects unrecognized dimensions and malformed codes", () => {
  const error = Object.assign(new Error("do not log"), { code: "23505;secret=value" });
  const context = buildSafeEdgeErrorContext({
    requestId: "request-456",
    method: "DELETE",
    operation: "dropAll",
    entity: "CustomerSensitiveData",
    stage: "serialize-payload",
    status: 200,
    error,
  });

  assert.equal(context.method, "other");
  assert.equal(context.operation, "unknown");
  assert.equal(context.entity, "unknown");
  assert.equal(context.stage, "unknown");
  assert.equal(context.status, 500);
  assert.equal("error_code" in context, false);
  assert.doesNotMatch(JSON.stringify(context), /do not log|secret=value/);
});
