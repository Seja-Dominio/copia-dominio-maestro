const relationalWriterByEntityAndOperation = {
  Project: { create: "project-rpc", update: "project-rpc", delete: "project-delete-rpc" },
  Job: { create: "core-history-rpc", update: "core-history-rpc", delete: "core-history-rpc" },
  Subtask: {
    create: "core-history-rpc",
    update: "core-history-rpc",
    delete: "core-history-rpc",
    transferSubtasks: "task-transfer-rpc",
  },
  FinancialEntry: {
    create: "financial-rpc",
    update: "financial-rpc",
    delete: "financial-delete-rpc",
    bulkCreate: "financial-rpc",
  },
};

export function isFrozenRelationalSource(registryEntry) {
  return registryEntry?.status === "frozen"
    && registryEntry?.write_mode === "relational"
    && registryEntry?.legacy_write_allowed === false;
}

export function getCutoverWritePlan(registryEntry, entity, operation) {
  if (!["create", "update", "delete", "bulkCreate", "transferSubtasks"].includes(operation)) {
    return { mode: "read" };
  }
  if (registryEntry?.status === "retired") {
    return { mode: "unsupported", reason: "Retired entities cannot be mutated through the generic API." };
  }
  if (registryEntry?.status === "frozen"
    && (registryEntry?.write_mode !== "relational" || registryEntry?.legacy_write_allowed !== false)) {
    return { mode: "unsupported", reason: "Frozen entity has an invalid write-mode contract." };
  }
  const canonicalRelationalWrite = isFrozenRelationalSource(registryEntry);
  if (!canonicalRelationalWrite) return { mode: "legacy" };

  const writer = relationalWriterByEntityAndOperation[entity]?.[operation];
  return writer
    ? { mode: "relational", writer }
    : { mode: "unsupported", reason: "No relational writer is registered for this entity/operation." };
}
