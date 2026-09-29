const RELEASE_VALUES = new Set([
  "non_cxm_candidate",
  "cxm_only",
  "blocked_shared",
  "internal_excluded",
]);
const ALLOWED_CANDIDATE_PRODUCTS = new Set(["maestro", "ads_brain", "insights"]);

export function validateEdgeFunctionProductBoundaries({ functionDirectories, manifest }) {
  const errors = [];
  const actual = new Set(functionDirectories);
  const declared = Object.keys(manifest.functions || {});
  const pending = manifest.pending_functions || {};
  const pendingNames = Object.keys(pending);
  const candidate = manifest.non_cxm_candidate?.functions || [];
  const candidateSet = new Set(candidate);
  const blockedSharedFunctions = declared.filter((name) => manifest.functions[name].release === "blocked_shared");
  const pendingReleaseFunctions = pendingNames.filter((name) => pending[name].intended_release === "non_cxm_candidate");
  const pendingCxmFunctions = pendingNames.filter((name) => pending[name].product === "cxm");
  const pendingSharedFunctions = pendingNames.filter((name) => pending[name].product === "shared");
  const releaseBlockers = [
    ...blockedSharedFunctions.map((name) => `${name}: shared function must be split or removed with proven feature impact`),
    ...pendingReleaseFunctions
      .map((name) => `${name}: non-CXM function is pending reconciliation and cannot be released yet`),
    ...pendingSharedFunctions.map((name) => `${name}: shared function is pending product-boundary review`),
  ];

  for (const name of actual) {
    if (!pending[name] && !manifest.functions?.[name]) {
      errors.push(`${name}: function directory is unclassified`);
    }
  }
  for (const name of declared) {
    if (!actual.has(name)) errors.push(`${name}: manifest entry has no function directory`);
    const entry = manifest.functions[name];
    if (!entry?.product || !RELEASE_VALUES.has(entry.release)) {
      errors.push(`${name}: product or release policy is invalid`);
    }
    if (entry?.product === "cxm" && entry.release !== "cxm_only") {
      errors.push(`${name}: CXM-owned function must be CXM-only`);
    }
    if (entry?.release === "non_cxm_candidate" && entry.product === "cxm") {
      errors.push(`${name}: CXM function is included in the non-CXM candidate`);
    }
    if ((entry?.release === "cxm_only" || entry?.release === "blocked_shared" || entry?.release === "internal_excluded")
      && candidateSet.has(name)) {
      errors.push(`${name}: excluded/blocked function is included in the non-CXM candidate`);
    }
    if (entry?.release === "non_cxm_candidate" && !candidateSet.has(name)) {
      errors.push(`${name}: candidate policy is missing from the non-CXM function list`);
    }
  }
  for (const name of candidateSet) {
    if (!manifest.functions?.[name]) errors.push(`${name}: non-CXM candidate is not classified`);
    else if (manifest.functions[name].release !== "non_cxm_candidate"
      || !ALLOWED_CANDIDATE_PRODUCTS.has(manifest.functions[name].product)) {
      errors.push(`${name}: CXM/shared/internal function is included in the non-CXM candidate`);
    }
  }
  for (const name of pendingNames) {
    const entry = pending[name];
    if (manifest.functions?.[name]) errors.push(`${name}: function cannot be both versioned and pending`);
    if (!entry?.product || !RELEASE_VALUES.has(entry.intended_release)) {
      errors.push(`${name}: pending product or intended release is invalid`);
    }
    if (entry?.product === "cxm" && entry.intended_release !== "cxm_only") {
      errors.push(`${name}: pending CXM function must remain CXM-only`);
    }
    if (candidateSet.has(name)) errors.push(`${name}: pending function is included in the non-CXM candidate`);
  }
  if (candidate.length !== candidateSet.size) errors.push("non-CXM candidate contains duplicate function names");
  return {
    status: errors.length ? "failed" : "ok",
    classified_functions: actual.size,
    non_cxm_candidate_functions: candidate.length,
    blocked_shared_functions: blockedSharedFunctions,
    cxm_only_functions: declared.filter((name) => manifest.functions[name].release === "cxm_only"),
    pending_functions: pendingNames,
    pending_cxm_functions: pendingCxmFunctions,
    pending_non_cxm_functions: pendingReleaseFunctions,
    release_ready: errors.length === 0
      && candidate.length > 0
      && blockedSharedFunctions.length === 0
      && pendingSharedFunctions.length === 0
      && releaseBlockers.length === 0,
    release_blockers: releaseBlockers,
    errors,
  };
}
