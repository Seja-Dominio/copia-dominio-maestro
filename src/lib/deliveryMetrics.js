import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { isClosedJob, isJobOverdue, isOpenSubtask, isPostSchedulingSubtask, isSubtaskOverdue, normalizeWorkflowStatus } from "@/lib/jobWorkflow";
import { todayStr as getTodayStr } from "@/lib/dateUtils";

function dayOnly(value) {
  return value ? String(value).slice(0, 10) : "";
}

function isCompletedSubtask(subtask) {
  return Boolean(subtask?.is_completed) || normalizeWorkflowStatus(subtask?.status) === "completed";
}

function isInPeriod(date, period) {
  const day = dayOnly(date);
  return Boolean(day && day >= period.start && day <= period.end);
}

function nameFor(id, fallback, collaboratorsById) {
  if (!id || id === "__unassigned__") return fallback || "Sem responsável";
  return fallback || collaboratorsById.get(id)?.name || "Responsável não identificado";
}

export function getCurrentMonthPeriod(today = getTodayStr()) {
  return { start: `${today.slice(0, 7)}-01`, end: today };
}

export function getCurrentStageSubtask(jobId, subtasks = []) {
  return subtasks
    .filter((subtask) => subtask.job_id === jobId && isOpenSubtask(subtask))
    .sort((left, right) => (left.order ?? 999) - (right.order ?? 999))[0] || null;
}

export function calculateDeliveryMetrics({ jobs = [], subtasks = [], collaborators = [], clients = [], today = getTodayStr(), period } = {}) {
  const effectivePeriod = period || getCurrentMonthPeriod(today);
  const activeJobs = jobs.filter((job) => normalizeWorkflowStatus(job.status) !== "cancelled");
  const jobById = new Map(activeJobs.map((job) => [job.id, job]));
  const relevantSubtasks = subtasks.filter((subtask) => jobById.has(subtask.job_id));
  const openJobs = activeJobs.filter((job) => !isClosedJob(job));
  const openJobIds = new Set(openJobs.map((job) => job.id));
  const collaboratorsById = new Map(collaborators.map((collaborator) => [collaborator.id, collaborator]));
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  const subtasksByJob = new Map();

  relevantSubtasks.forEach((subtask) => {
    if (!subtasksByJob.has(subtask.job_id)) subtasksByJob.set(subtask.job_id, []);
    subtasksByJob.get(subtask.job_id).push(subtask);
  });

  const overdueJobs = openJobs.filter((job) => {
    const currentStage = getCurrentStageSubtask(job.id, subtasksByJob.get(job.id) || []);
    return isInPeriod(job.post_date, effectivePeriod)
      && isJobOverdue(job, today, "post_date")
      && !isPostSchedulingSubtask(currentStage);
  });
  const overdueTasks = relevantSubtasks.filter((subtask) => isInPeriod(subtask.deadline, effectivePeriod) && openJobIds.has(subtask.job_id) && isSubtaskOverdue(subtask, today));
  const overdueTasksByJob = new Map();
  overdueTasks.forEach((subtask) => {
    if (!overdueTasksByJob.has(subtask.job_id)) overdueTasksByJob.set(subtask.job_id, []);
    overdueTasksByJob.get(subtask.job_id).push(subtask);
  });

  const completedTasks = relevantSubtasks.filter((subtask) => isCompletedSubtask(subtask) && isInPeriod(subtask.completed_at, effectivePeriod));
  const completedTasksWithDeadline = completedTasks.filter((subtask) => dayOnly(subtask.deadline));
  const onTimeTasks = completedTasksWithDeadline.filter((subtask) => dayOnly(subtask.completed_at) <= dayOnly(subtask.deadline));

  const responsibleData = new Map();
  const ensureResponsible = (id, fallbackName) => {
    const key = id || "__unassigned__";
    if (!responsibleData.has(key)) {
      responsibleData.set(key, { id: key, name: nameFor(key, fallbackName, collaboratorsById), overdueJobs: new Set(), overdueTasks: 0, completedTasks: 0, onTimeTasks: 0, lateTasks: 0, completedWithoutDeadline: 0 });
    }
    return responsibleData.get(key);
  };

  collaborators.forEach((collaborator) => ensureResponsible(collaborator.id, collaborator.name));
  completedTasks.forEach((subtask) => {
    const row = ensureResponsible(subtask.responsible_id, subtask.responsible_name);
    row.completedTasks += 1;
    if (!dayOnly(subtask.deadline)) row.completedWithoutDeadline += 1;
    else if (dayOnly(subtask.completed_at) <= dayOnly(subtask.deadline)) row.onTimeTasks += 1;
    else row.lateTasks += 1;
  });
  overdueTasks.forEach((subtask) => {
    ensureResponsible(subtask.responsible_id, subtask.responsible_name).overdueTasks += 1;
  });

  const overdueJobOwners = new Map();
  overdueJobs.forEach((job) => {
    const stageTasks = overdueTasksByJob.get(job.id) || [];
    const fallbackStage = getCurrentStageSubtask(job.id, subtasksByJob.get(job.id) || []);
    const owners = stageTasks.map((subtask) => subtask.responsible_id).filter(Boolean);
    const ownerIds = owners.length ? [...new Set(owners)] : [fallbackStage?.responsible_id || job.responsible_id || "__unassigned__"];
    overdueJobOwners.set(job.id, ownerIds);
    ownerIds.forEach((ownerId) => ensureResponsible(ownerId, fallbackStage?.responsible_name || job.responsible_name).overdueJobs.add(job.id));
  });

  const responsibleRows = [...responsibleData.values()]
    .map((row) => ({ ...row, overdueJobs: row.overdueJobs.size, onTimeRate: row.onTimeTasks + row.lateTasks > 0 ? Math.round((row.onTimeTasks / (row.onTimeTasks + row.lateTasks)) * 100) : null }))
    .filter((row) => row.overdueJobs || row.overdueTasks || row.completedTasks)
    .sort((left, right) => right.overdueJobs - left.overdueJobs || right.overdueTasks - left.overdueTasks || (right.onTimeRate ?? -1) - (left.onTimeRate ?? -1) || left.name.localeCompare(right.name));

  const stageData = new Map();
  const ensureStage = (responsibleId, responsibleName, stage) => {
    const key = `${responsibleId || "__unassigned__"}::${stage || "Etapa não identificada"}`;
    if (!stageData.has(key)) stageData.set(key, { key, responsibleId: responsibleId || "__unassigned__", responsibleName: nameFor(responsibleId, responsibleName, collaboratorsById), stage: stage || "Etapa não identificada", jobs: new Set(), tasks: 0, oldestPostDate: "" });
    return stageData.get(key);
  };

  overdueJobs.forEach((job) => {
    const stageTasks = overdueTasksByJob.get(job.id) || [];
    const fallbackStage = getCurrentStageSubtask(job.id, subtasksByJob.get(job.id) || []);
    const contexts = stageTasks.length ? stageTasks : [fallbackStage || { responsible_id: job.responsible_id, responsible_name: job.responsible_name, title: "Etapa atual" }];
    contexts.forEach((subtask) => {
      const row = ensureStage(subtask.responsible_id, subtask.responsible_name, subtask.title);
      row.jobs.add(job.id);
      if (stageTasks.includes(subtask)) row.tasks += 1;
      if (job.post_date && (!row.oldestPostDate || job.post_date < row.oldestPostDate)) row.oldestPostDate = job.post_date;
    });
  });

  const stageRows = [...stageData.values()]
    .map((row) => ({ ...row, jobs: row.jobs.size, ageDays: row.oldestPostDate ? Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(row.oldestPostDate))) : 0 }))
    .sort((left, right) => right.jobs - left.jobs || right.tasks - left.tasks || left.responsibleName.localeCompare(right.responsibleName));

  // The upcoming-postings KPI is a rolling operational window, not a
  // historical report period. It must match the Dashboard's post calendar.
  const upcomingNotScheduled = openJobs.filter((job) => job.post_date && job.post_date >= today && job.post_date <= format(addDays(parseISO(today), 5), "yyyy-MM-dd"));
  const activeTasks = relevantSubtasks.filter((subtask) => openJobIds.has(subtask.job_id) && isOpenSubtask(subtask));
  const clientRows = [...new Set(overdueJobs.map((job) => job.client_id).filter(Boolean))]
    .map((clientId) => ({ id: clientId, name: clientsById.get(clientId)?.name || overdueJobs.find((job) => job.client_id === clientId)?.client_name || "Cliente não identificado", jobs: overdueJobs.filter((job) => job.client_id === clientId).length, tasks: overdueTasks.filter((subtask) => jobById.get(subtask.job_id)?.client_id === clientId).length }))
    .sort((left, right) => right.jobs - left.jobs || right.tasks - left.tasks);

  const detailRows = [
    ...overdueJobs.map((job) => {
      const currentStage = getCurrentStageSubtask(job.id, subtasksByJob.get(job.id) || []);
      return {
        key: `job-${job.id}`,
        kind: "Job atrasado",
        clientId: job.client_id || "",
        clientName: clientsById.get(job.client_id)?.name || job.client_name || "Cliente não identificado",
        jobId: job.id,
        jobTitle: job.title || "Job sem título",
        taskTitle: currentStage?.title || "Data de postagem do job",
        date: job.post_date || "",
        responsibleId: currentStage?.responsible_id || job.responsible_id || "",
        responsibleName: currentStage?.responsible_name || job.responsible_name || collaboratorsById.get(job.responsible_id)?.name || "Sem responsável",
        status: job.status || "",
      };
    }),
    ...overdueTasks.map((subtask) => {
      const job = jobById.get(subtask.job_id);
      return {
        key: `task-${subtask.id}`,
        kind: "Tarefa atrasada",
        clientId: job?.client_id || "",
        clientName: clientsById.get(job?.client_id)?.name || job?.client_name || "Cliente não identificado",
        jobId: job?.id || subtask.job_id || "",
        jobTitle: job?.title || "Job não identificado",
        taskTitle: subtask.title || "Tarefa sem título",
        date: subtask.deadline || "",
        responsibleId: subtask.responsible_id || "",
        responsibleName: subtask.responsible_name || collaboratorsById.get(subtask.responsible_id)?.name || "Sem responsável",
        status: subtask.status || "pending",
      };
    }),
    ...completedTasksWithDeadline.map((subtask) => {
      const job = jobById.get(subtask.job_id);
      return {
        key: `completed-${subtask.id}`,
        kind: dayOnly(subtask.completed_at) <= dayOnly(subtask.deadline) ? "Entregue no prazo" : "Entregue fora do prazo",
        clientId: job?.client_id || "",
        clientName: clientsById.get(job?.client_id)?.name || job?.client_name || "Cliente não identificado",
        jobId: job?.id || subtask.job_id || "",
        jobTitle: job?.title || "Job não identificado",
        taskTitle: subtask.title || "Tarefa sem título",
        date: subtask.completed_at || subtask.deadline || "",
        responsibleId: subtask.responsible_id || "",
        responsibleName: subtask.responsible_name || collaboratorsById.get(subtask.responsible_id)?.name || "Sem responsável",
        status: subtask.status || "completed",
      };
    }),
  ].sort((left, right) => String(left.date || "9999-12-31").localeCompare(String(right.date || "9999-12-31")) || left.clientName.localeCompare(right.clientName) || left.jobTitle.localeCompare(right.jobTitle));

  return {
    period: effectivePeriod,
    overdueJobs,
    overdueTasks,
    activeTasks,
    upcomingNotScheduled,
    responsibleRows,
    stageRows,
    clientRows,
    detailRows,
    overdueJobOwners,
    totals: {
      overdueJobs: overdueJobs.length,
      overdueTasks: overdueTasks.length,
      activeJobs: openJobs.length,
      activeTasks: activeTasks.length,
      upcomingNotScheduled: upcomingNotScheduled.length,
      completedTasks: completedTasksWithDeadline.length,
      onTimeTasks: onTimeTasks.length,
      lateTasks: completedTasksWithDeadline.length - onTimeTasks.length,
      onTimeRate: completedTasksWithDeadline.length > 0 ? Math.round((onTimeTasks.length / completedTasksWithDeadline.length) * 100) : null,
    },
  };
}
