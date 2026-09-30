export function assessLegacyRemovalReadiness(registry, pendingWork, failures = [], nonRegistryCutover = []) {
  const entitiesNotRetired = registry
    .filter((row) => row.status !== "retired" || row.legacy_read_allowed || row.legacy_write_allowed)
    .map((row) => ({
      entity: row.entity,
      status: row.status,
      legacy_read_allowed: row.legacy_read_allowed,
      legacy_write_allowed: row.legacy_write_allowed,
    }));
  const nonRegistryEntitiesNotRetired = nonRegistryCutover
    .filter((row) => !["retired", "not_applicable"].includes(row.status)
      || !row.evidence?.trim())
    .map(({ entity, status, evidence }) => ({ entity, status, evidence: evidence || null }));

  return {
    safeToRemoveLegacy: registry.length > 0
      && entitiesNotRetired.length === 0
      && nonRegistryEntitiesNotRetired.length === 0
      && pendingWork.length === 0
      && failures.length === 0,
    entitiesNotRetired,
    nonRegistryEntitiesNotRetired,
    pendingWork,
  };
}
