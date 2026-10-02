const BUCKET = "job-attachments";

export function normalizeAttachmentPath(value) {
  if (value && typeof value === "object" && value.path) return String(value.path);
  const raw = String(value?.url || value || "");
  const markers = [
    `/storage/v1/object/sign/${BUCKET}/`,
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/authenticated/${BUCKET}/`,
  ];
  const marker = markers.find((candidate) => raw.includes(candidate));
  if (!marker) return raw;
  const encoded = raw.slice(raw.indexOf(marker) + marker.length).split("?")[0];
  try { return decodeURIComponent(encoded); } catch { return encoded; }
}

export function jobContainsAttachmentPath(jobPayload = {}, comments = [], requestedPath) {
  if (!requestedPath) return false;
  const attached = Array.isArray(jobPayload.attachments) ? jobPayload.attachments : [];
  if (attached.some((item) => normalizeAttachmentPath(item) === requestedPath)) return true;
  return comments.some((comment) => {
    const content = String(comment?.content || "");
    const markdownUrls = [...content.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
    return markdownUrls.some((url) => normalizeAttachmentPath(url) === requestedPath);
  });
}

/**
 * @param {{ accessLevel: string, collaboratorId: string, jobPayload?: Record<string, any>, subtasks?: Array<{ payload: Record<string, any> }> }} options
 */
export function collaboratorCanReadJob({ accessLevel, collaboratorId, jobPayload = {}, subtasks = [] }) {
  if (["master", "gestor", "admin"].includes(String(accessLevel || "").toLowerCase())) return true;
  if (!collaboratorId) return false;
  if (String(jobPayload.responsible_id || "") === collaboratorId) return true;
  const jobId = String(jobPayload.id || "");
  return subtasks.some((row) =>
    String(row.payload?.responsible_id || "") === collaboratorId &&
    String(row.payload?.job_id || "") === jobId
  );
}
