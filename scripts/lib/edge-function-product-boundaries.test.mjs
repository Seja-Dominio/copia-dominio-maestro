import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { validateEdgeFunctionProductBoundaries } from "./edge-function-product-boundaries.mjs";

const liveManifest = JSON.parse(await fs.readFile(
  new URL("../config/edge-function-product-boundaries.json", import.meta.url), "utf8",
));
const liveFunctionDirectories = (await fs.readdir(new URL("../../supabase/functions/", import.meta.url), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name);

const manifest = {
  non_cxm_candidate: {
    readiness: "blocked_until_shared_functions_are_split",
    functions: ["maestro-data"],
  },
  functions: {
    "maestro-data": { product: "maestro", release: "non_cxm_candidate" },
    "cxm-data": { product: "cxm", release: "cxm_only" },
    "shared-worker": { product: "shared", release: "blocked_shared" },
  },
};

test("repository Edge Functions are exhaustively classified and CXM is excluded from release candidate", () => {
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: liveFunctionDirectories,
    manifest: liveManifest,
  });
  assert.equal(result.status, "ok", result.errors.join("\n"));
  assert.equal(result.release_ready, false);
  assert.ok(result.cxm_only_functions.length > 0);
  assert.ok(result.blocked_shared_functions.length > 0);
});

test("validates an exhaustive product boundary and keeps CXM outside non-CXM candidate", () => {
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-data", "cxm-data", "shared-worker"],
    manifest,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.release_ready, false);
  assert.deepEqual(result.cxm_only_functions, ["cxm-data"]);
  assert.deepEqual(result.blocked_shared_functions, ["shared-worker"]);
});

test("fails closed when a new Edge Function is not classified", () => {
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-data", "cxm-data", "shared-worker", "new-function"],
    manifest,
  });
  assert.ok(result.errors.includes("new-function: function directory is unclassified"));
});

test("rejects a CXM or shared function in the non-CXM candidate", () => {
  const invalidManifest = {
    ...manifest,
    non_cxm_candidate: {
      ...manifest.non_cxm_candidate,
      functions: ["maestro-data", "cxm-data", "shared-worker"],
    },
  };
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-data", "cxm-data", "shared-worker"],
    manifest: invalidManifest,
  });
  assert.ok(result.errors.includes("cxm-data: excluded/blocked function is included in the non-CXM candidate"));
  assert.ok(result.errors.includes("shared-worker: excluded/blocked function is included in the non-CXM candidate"));
});
test("refuses to mark non-CXM release ready while mixed workers remain coupled", () => {
  const invalidManifest = {
    ...manifest,
    non_cxm_candidate: { ...manifest.non_cxm_candidate, readiness: "ready" },
  };
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-data", "cxm-data", "shared-worker"],
    manifest: invalidManifest,
  });
  assert.ok(result.errors.includes("non-CXM release must remain blocked until shared functions are separated and proven"));
});
