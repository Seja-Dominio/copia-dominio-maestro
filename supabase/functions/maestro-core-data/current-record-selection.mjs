const RELATIONAL_CORE_ENTITIES = new Set(["Project", "Job", "Subtask"]);

export function selectCurrentCoreRecord({ entity, legacyWritesAllowed, legacyRecord, relationalRecord }) {
  if (!legacyWritesAllowed && RELATIONAL_CORE_ENTITIES.has(String(entity || "")) && relationalRecord?.payload) {
    return relationalRecord;
  }
  return legacyRecord?.payload ? legacyRecord : relationalRecord;
}
