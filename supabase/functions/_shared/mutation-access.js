const COLLABORATOR_JOB_FIELDS = new Set([
  "status", "post_date", "delivery_date", "content_type", "reference_url", "title", "briefing", "caption", "attachments",
]);
const COLLABORATOR_SUBTASK_CREATE_FIELDS = new Set([
  "job_id", "title", "status", "responsible_id", "responsible_name", "deadline", "order",
]);

export function canReadFinancialData(session = {}) {
  if (session.scope === "group") return false;
  const accessLevel = String(session.access_level || "").toLowerCase();
  if (["master", "admin"].includes(accessLevel)) return true;
  const permissions = session.permissions && typeof session.permissions === "object" ? session.permissions : {};
  if (accessLevel === "gestor" && permissions.tabs?.Financial === true) return true;
  return ["view", "full"].includes(String(permissions.reports || "").toLowerCase());
}

export function groupSessionMayRun(operation) {
  return ["list", "filter"].includes(operation);
}

export function collaboratorJobPatchAllowed(payload = {}) {
  const keys = Object.keys(payload);
  if (!keys.length || keys.some((key) => !COLLABORATOR_JOB_FIELDS.has(key))) return false;
  return payload.status === undefined || String(payload.status).trim().toLowerCase() !== "cancelled";
}

export async function authorizeCollaboratorJobPatch(payload = {}, assertAssignment) {
  if (!collaboratorJobPatchAllowed(payload)) return false;
  await assertAssignment();
  return true;
}

export function collaboratorSubtaskCreateAllowed(payload = {}) {
  const keys = Object.keys(payload);
  return keys.length > 0
    && keys.every((key) => COLLABORATOR_SUBTASK_CREATE_FIELDS.has(key))
    && Boolean(String(payload.job_id || "").trim())
    && Boolean(String(payload.title || "").trim());
}
