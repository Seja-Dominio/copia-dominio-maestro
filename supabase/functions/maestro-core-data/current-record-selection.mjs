const RELATIONAL_CORE_ENTITIES = new Set(["Project", "Job", "Subtask"]);

export function selectCurrentCoreRecord({ entity, legacyWritesAllowed, legacyRecord, relationalRecord }) {
  if (!legacyWritesAllowed && RELATIONAL_CORE_ENTITIES.has(String(entity || "")) && relationalRecord?.payload) {
    return relationalRecord;
  }
  return legacyRecord?.payload ? legacyRecord : relationalRecord;
}

export async function loadCurrentCoreRecord({ entity, legacyWritesAllowed, loadLegacyRecord, loadRelationalRecord }) {
  if (!legacyWritesAllowed && RELATIONAL_CORE_ENTITIES.has(String(entity || ""))) {
    const relationalRecord = await loadRelationalRecord();
    if (relationalRecord?.payload) return relationalRecord;
  }
  return await loadLegacyRecord();
}
