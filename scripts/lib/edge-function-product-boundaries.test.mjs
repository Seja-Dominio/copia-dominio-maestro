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
  assert.deepEqual(result.pending_cxm_functions, ["cxm-data", "cxm-deskcomm-sso"]);
  assert.ok(result.blocked_shared_functions.length > 0);
  assert.equal(result.pending_non_cxm_functions.length, 15);
  assert.ok(result.release_blockers.some((blocker) => blocker.startsWith("admin-timesheets: non-CXM function is pending reconciliation")));
  assert.ok(result.release_blockers.some((blocker) => blocker.includes("maestro-data: shared function")));
  assert.equal(liveManifest.functions["system-reports"].product, "maestro");
  assert.ok(liveManifest.non_cxm_candidate.functions.includes("system-reports"));
  assert.equal(liveManifest.pending_functions["cxm-data"].intended_release, "cxm_only");
  assert.ok(!liveManifest.non_cxm_candidate.functions.includes("cxm-data"));
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
  assert.ok(result.release_blockers.includes("shared-worker: shared function must be split or removed with proven feature impact"));
});

test("marks a non-CXM candidate ready only when no shared function remains coupled", () => {
  const cleanManifest = {
    non_cxm_candidate: { functions: ["maestro-data"] },
    functions: {
      "maestro-data": { product: "maestro", release: "non_cxm_candidate" },
    },
  };
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-data"],
    manifest: cleanManifest,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.release_ready, true);
  assert.deepEqual(result.release_blockers, []);
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
test("refuses a candidate that includes a mixed worker while allowing excluded workers to remain", () => {
  const invalidManifest = {
    ...manifest,
    non_cxm_candidate: { ...manifest.non_cxm_candidate, functions: ["maestro-data", "shared-worker"] },
  };
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-data", "cxm-data", "shared-worker"],
    manifest: invalidManifest,
  });
  assert.ok(result.errors.includes("shared-worker: excluded/blocked function is included in the non-CXM candidate"));
  assert.ok(result.errors.includes("shared-worker: CXM/shared/internal function is included in the non-CXM candidate"));
  assert.equal(result.release_ready, false);
});

test("allows a non-CXM candidate with CXM pending only when the pending function stays excluded", () => {
  const pendingManifest = {
    non_cxm_candidate: {
      readiness: "blocked_until_shared_functions_are_split",
      functions: ["maestro-data"],
    },
    functions: {
      "maestro-data": { product: "maestro", release: "non_cxm_candidate" },
    },
    pending_functions: {
      "cxm-data": { product: "cxm", intended_release: "cxm_only" },
    },
  };
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-data", "cxm-data"],
    manifest: pendingManifest,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.release_ready, true);
  assert.deepEqual(result.pending_cxm_functions, ["cxm-data"]);
  assert.deepEqual(result.pending_non_cxm_functions, []);
  assert.deepEqual(result.release_blockers, []);
  assert.ok(!pendingManifest.non_cxm_candidate.functions.includes("cxm-data"));
});

test("blocks release while any intended non-CXM function is pending reconciliation", () => {
  const pendingManifest = {
    non_cxm_candidate: { functions: ["maestro-core-data"] },
    functions: {
      "maestro-core-data": { product: "maestro", release: "non_cxm_candidate" },
    },
    pending_functions: {
      "admin-timesheets": { product: "maestro", intended_release: "non_cxm_candidate" },
      "cxm-data": { product: "cxm", intended_release: "cxm_only" },
    },
  };
  const result = validateEdgeFunctionProductBoundaries({
    functionDirectories: ["maestro-core-data", "admin-timesheets", "cxm-data"],
    manifest: pendingManifest,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.release_ready, false);
  assert.deepEqual(result.pending_non_cxm_functions, ["admin-timesheets"]);
  assert.deepEqual(result.pending_cxm_functions, ["cxm-data"]);
  assert.ok(result.release_blockers.includes(
    "admin-timesheets: non-CXM function is pending reconciliation and cannot be released yet",
  ));
  assert.ok(!result.release_blockers.some((blocker) => blocker.includes("cxm-data")));
  assert.ok(!pendingManifest.non_cxm_candidate.functions.includes("cxm-data"));
});
