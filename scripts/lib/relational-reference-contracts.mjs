const allowedDispositions = new Set([
  "tenant_fk_required",
  "tenant_fk_enforced",
  "compatibility_duplicate",
  "reconciliation_pending",
  "audit_snapshot",
  "dictionary_key",
  "external_identifier",
]);

export function validateRelationalReferenceContracts(actualColumns, contracts) {
  const failures = [];
  const contractKeys = contracts.map((entry) => `${entry.table}.${entry.column}`);
  const contractSet = new Set(contractKeys);
  const actualSet = new Set(actualColumns.map((entry) => `${entry.table}.${entry.column}`));

  for (const key of actualSet) {
    if (!contractSet.has(key)) failures.push(`${key}:relational_reference_contract_missing`);
  }
  for (const key of contractSet) {
    if (!actualSet.has(key)) failures.push(`${key}:stale_relational_reference_contract`);
  }

  const seen = new Set();
  for (const entry of contracts) {
    const key = `${entry.table}.${entry.column}`;
    if (seen.has(key)) failures.push(`${key}:duplicate_relational_reference_contract`);
    seen.add(key);
    const missingFkTarget = ["tenant_fk_required", "tenant_fk_enforced"].includes(entry.disposition)
      && (!entry.target_table || !entry.target_column);
    if (!entry.target || !entry.rationale || !allowedDispositions.has(entry.disposition) || missingFkTarget) {
      failures.push(`${key}:incomplete_or_invalid_relational_reference_contract`);
    }
  }
  return failures;
}

export function validateTenantForeignKeyContracts(expectedRelations, observedRelations) {
  const failures = [];
  const observed = new Map(observedRelations.map((relation) => [
    `${relation.table}.${relation.column}->${relation.target_table}.${relation.target_column}`,
    relation.validated === true,
  ]));
  for (const relation of expectedRelations) {
    const key = `${relation.table}.${relation.column}->${relation.target_table}.${relation.target_column}`;
    if (observed.get(key) !== true) failures.push(`${key}:tenant_fk_missing_or_unvalidated`);
  }
  return failures;
}
