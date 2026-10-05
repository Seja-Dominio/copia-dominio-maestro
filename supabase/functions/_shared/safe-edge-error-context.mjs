const ENTITIES = new Set(["Project", "Job", "Subtask", "FinancialEntry", "JobHistory"]);
const OPERATIONS = new Set(["list", "get", "create", "update", "delete", "bulkCreate"]);
const STAGES = new Set(["authenticate", "parse_body", "handle"]);

function allowlisted(value, allowed) {
  const candidate = String(value ?? "");
  return allowed.has(candidate) ? candidate : "unknown";
}

function safeErrorName(error) {
  const name = error instanceof Error ? error.name : "UnknownError";
  return /^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name) ? name : "UnknownError";
}

function safeErrorCode(error) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = String(error.code ?? "");
  return /^[A-Za-z0-9_]{1,16}$/.test(code) ? code : undefined;
}

export function buildSafeEdgeErrorContext({ requestId, method, operation, entity, stage, status, error }) {
  return {
    event: "maestro_core_data_error",
    request_id: String(requestId || "unknown"),
    method: method === "POST" ? "POST" : "other",
    stage: allowlisted(stage, STAGES),
    operation: allowlisted(operation, OPERATIONS),
    entity: allowlisted(entity, ENTITIES),
    status: Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500,
    error_name: safeErrorName(error),
    ...(safeErrorCode(error) ? { error_code: safeErrorCode(error) } : {}),
  };
}
