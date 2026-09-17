export const CLOSED_JOB_STATUSES = new Set(["completed", "scheduled", "cancelled"]);

export function normalizeReportStatus(status) {
  return String(status || "").trim().toLowerCase();
}

export function isClosedReportJob(job) {
  return CLOSED_JOB_STATUSES.has(normalizeReportStatus(job?.status));
}

export function isCancelledReportJob(job) {
  return normalizeReportStatus(job?.status) === "cancelled";
}

export function isOpenReportSubtask(subtask) {
  if (!subtask || subtask.is_completed === true) return false;
  return normalizeReportStatus(subtask.status || "pending") !== "completed";
}

export function getCurrentReportSubtask(jobId, subtasks = []) {
  return subtasks
    .filter((subtask) => subtask.job_id === jobId && isOpenReportSubtask(subtask))
    .sort((left, right) => (left.order ?? 999) - (right.order ?? 999))[0] || null;
}

export function enrichReportJob(job, subtasks = []) {
  const current = getCurrentReportSubtask(job?.id, subtasks);
  if (!current) return job;
  return {
    ...job,
    stage_title: current.title || job.stage_title,
    stage_responsible_name: current.responsible_name || job.stage_responsible_name,
    stage_responsible_id: current.responsible_id || job.stage_responsible_id,
  };
}

export function enrichReportJobs(jobs = [], subtasks = []) {
  return jobs.map((job) => enrichReportJob(job, subtasks));
}

export function isReportPostOverdue(job, today) {
  return Boolean(job?.post_date && job.post_date < today && !isClosedReportJob(job));
}

export function isReportSubtaskOverdue(task, job, today) {
  const deadline = task?.deadline || job?.post_date;
  return Boolean(deadline && deadline < today && isOpenReportSubtask(task) && job && !isClosedReportJob(job));
}
