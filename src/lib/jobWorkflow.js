export const CLOSED_JOB_STATUSES = new Set(["completed", "scheduled", "cancelled"]);

export function normalizeWorkflowStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export function isClosedJob(job) {
  return CLOSED_JOB_STATUSES.has(normalizeWorkflowStatus(job?.status));
}

export function isOpenSubtask(subtask) {
  if (!subtask || subtask.is_completed) return false;
  return normalizeWorkflowStatus(subtask.status || "pending") !== "completed";
}

export function isPostSchedulingSubtask(subtask) {
  const title = String(subtask?.title || subtask?.name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return title === "conferencia" || title.startsWith("conferencia ");
}

export function isJobOverdue(job, today, dateField = "post_date") {
  return Boolean(job?.[dateField] && job[dateField] < today && !isClosedJob(job));
}

export function isSubtaskOverdue(subtask, today) {
  return Boolean(
    subtask?.deadline
    && subtask.deadline < today
    && isOpenSubtask(subtask)
    && !isPostSchedulingSubtask(subtask),
  );
}

export function isWithinNextDays(date, today, lastDay) {
  return Boolean(date && date > today && date <= lastDay);
}
