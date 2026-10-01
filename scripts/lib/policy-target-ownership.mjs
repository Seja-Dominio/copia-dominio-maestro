const allowedProducts = new Set(["maestro", "cxm", "ads_brain", "insights"]);

function unique(values) {
  return [...new Set(values)];
}

export function extractPolicyTargets(sql) {
  const arrayBody = sql.match(/foreach\s+table_name\s+in\s+array\s+array\[([\s\S]*?)\]\s+loop/i)?.[1];
  if (!arrayBody) throw new Error("Could not find the table target array in the RLS migration");
  const names = [...arrayBody.matchAll(/'([a-z][a-z0-9_]*)'/g)].map((match) => match[1]);
  if (names.length === 0 || unique(names).length !== names.length) {
    throw new Error("RLS migration targets must be non-empty and unique");
  }
  return names;
}

export function extractRegistryOwnership(sql) {
  const pairs = [...sql.matchAll(/\(\s*'[^']+'\s*,\s*'(maestro|cxm|ads_brain|insights)'\s*,\s*'(maestro_[a-z0-9_]+)'\s*,/g)]
    .map((match) => ({ table: match[2], product: match[1] }));
  const seen = new Set();
  for (const pair of pairs) {
    if (seen.has(pair.table)) throw new Error(`Duplicate registry ownership for ${pair.table}`);
    seen.add(pair.table);
  }
  return pairs;
}

export function verifyPolicyTargetOwnership({ migrationSql, registrySql, supplementalTargets, evidenceExists = () => true }) {
  const targets = extractPolicyTargets(migrationSql);
  const registry = extractRegistryOwnership(registrySql);
  const supplemental = supplementalTargets?.targets;
  if (!Array.isArray(supplemental)) throw new Error("Supplemental target ownership must provide a targets array");

  const registryByTable = new Map(registry.map((entry) => [entry.table, entry.product]));
  const supplementalByTable = new Map();
  for (const entry of supplemental) {
    if (!entry || typeof entry.table !== "string" || !allowedProducts.has(entry.product)) {
      throw new Error("Each supplemental target needs a table and a supported product owner");
    }
    if (supplementalByTable.has(entry.table)) throw new Error(`Duplicate supplemental ownership for ${entry.table}`);
    if (registryByTable.has(entry.table)) throw new Error(`Supplemental ownership duplicates registry target ${entry.table}`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0 || entry.evidence.some((path) => !evidenceExists(path))) {
      throw new Error(`Missing or invalid ownership evidence for ${entry.table}`);
    }
    supplementalByTable.set(entry.table, entry.product);
  }

  const targetSet = new Set(targets);
  for (const table of supplementalByTable.keys()) {
    if (!targetSet.has(table)) throw new Error(`Stale supplemental target ${table} is not in the RLS migration`);
  }
  const unclassified = targets.filter((table) => !registryByTable.has(table) && !supplementalByTable.has(table));
  if (unclassified.length) throw new Error(`Unclassified RLS migration targets: ${unclassified.join(", ")}`);

  return {
    targetCount: targets.length,
    registryClassifiedCount: targets.filter((table) => registryByTable.has(table)).length,
    supplementalClassifiedCount: supplementalByTable.size,
    owners: Object.fromEntries(targets.map((table) => [table, registryByTable.get(table) || supplementalByTable.get(table)])),
  };
}
