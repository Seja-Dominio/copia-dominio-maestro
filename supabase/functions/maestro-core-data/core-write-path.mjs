export function selectCoreWritePath({ entity, operation, legacyWritesAllowed }) {
  if (!["Job", "Subtask", "Project"].includes(entity)) return "not-applicable";
  if (entity === "Project" && operation === "delete") return "not-applicable";
  if (legacyWritesAllowed) return "legacy-rpc";
  if (entity === "Job" || entity === "Subtask") return "relational-history-rpc";
  if (entity === "Project" && operation !== "delete") return "relational-upsert";
  return "not-applicable";
}
