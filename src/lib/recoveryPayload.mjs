const RECOVERY_METADATA_FIELDS = [
  "created_date",
  "updated_date",
  "created_by",
  "created_by_id",
];

export function prepareRecoveryPayload(deleteLog, entityName) {
  const snapshot = deleteLog?.entity_data;
  const data = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? { ...snapshot }
    : {};

  for (const field of RECOVERY_METADATA_FIELDS) delete data[field];

  if (entityName === "Job") {
    const loggedId = deleteLog?.entity_id == null ? "" : String(deleteLog.entity_id);
    const snapshotId = data.id == null ? "" : String(data.id);
    if (loggedId && snapshotId && loggedId !== snapshotId) {
      throw new Error("O ID do Job não confere com o registro de recuperação.");
    }
    const originalId = loggedId || snapshotId;
    if (!originalId) throw new Error("O registro de recuperação não contém o ID original do Job.");
    data.id = originalId;
  } else {
    delete data.id;
  }

  return data;
}
