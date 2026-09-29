const RELEASE_VALUES = new Set([
  "non_cxm_candidate",
  "cxm_only",
  "blocked_shared",
  "internal_excluded",
]);

export function validateEdgeFunctionProductBoundaries({ functionDirectories, manifest }) {
  const errors = [];
  const actual = new Set(functionDirectories);
  const declared = Object.keys(manifest.functions || {});
  const candidate = manifest.non_cxm_candidate?.functions || [];
  const candidateSet = new Set(candidate);

  for (const name of actual) {
    if (!manifest.functions?.[name]) errors.push(`${name}: function directory is unclassified`);
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
  }
  if (candidate.length !== candidateSet.size) errors.push("non-CXM candidate contains duplicate function names");
  if (manifest.non_cxm_candidate?.readiness !== "blocked_until_shared_functions_are_split") {
    errors.push("non-CXM release must remain blocked until shared functions are separated and proven");
  }

  return {
    status: errors.length ? "failed" : "ok",
    classified_functions: actual.size,
    non_cxm_candidate_functions: candidate.length,
    blocked_shared_functions: declared.filter((name) => manifest.functions[name].release === "blocked_shared"),
    cxm_only_functions: declared.filter((name) => manifest.functions[name].release === "cxm_only"),
    release_ready: false,
    errors,
  };
}
