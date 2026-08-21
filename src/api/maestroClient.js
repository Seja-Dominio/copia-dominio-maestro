/**
 * Backend boundary for the Maestro application.
 *
 * Feature code must import `maestro` from this module. The current provider
 * remains isolated in base44Client while the Supabase provider is migrated
 * incrementally, keeping the application runnable during the transition.
 */
import { base44, getPublicSettings } from '@/api/base44Client';
import { createSupabaseEntities, invokePublicSupabaseFunction, invokeSupabaseFunction, loginCollaboratorWithSupabase } from '@/api/supabaseClient';

const dataProvider = import.meta.env.VITE_MAESTRO_DATA_PROVIDER || 'base44';

export const maestro = dataProvider === 'supabase'
  ? { ...base44, entities: createSupabaseEntities() }
  : base44;
export { getPublicSettings };

export async function getDashboardData({ collaborator_id } = {}) {
  if (dataProvider !== 'supabase') {
    return maestro.functions.invoke('getDashboardData', { collaborator_id });
  }

  const [projects, allJobs, entries, allCollaborators, timesheets, allClients, allAgendaEvents, allSubtasks] = await Promise.all([
    maestro.entities.Project.list('-created_date', 50),
    maestro.entities.Job.list('-post_date', 5000),
    maestro.entities.FinancialEntry.list('-created_date', 150),
    maestro.entities.Collaborator.list('name', 50),
    maestro.entities.Timesheet.list('-created_date', 1000),
    maestro.entities.Client.list('-nps_score', 50),
    maestro.entities.AgendaEvent.list('-date', 100),
    maestro.entities.Subtask.list('-created_date', 5000),
  ]);

  const activeCollaborators = allCollaborators.filter((collaborator) => collaborator.is_active !== false);
  const activeClients = allClients.filter((client) => client.status === 'active');
  const agendaEvents = allAgendaEvents.filter((event) => event.status !== 'cancelado');
  const inactiveProjectIds = new Set(
    projects
      .filter((project) => project.status === 'completed' || project.status === 'archived')
      .map((project) => project.id),
  );
  const jobs = allJobs.filter((job) => job.status !== 'cancelled' && !inactiveProjectIds.has(job.project_id));
  const activeJobIds = new Set(jobs.map((job) => job.id));
  const subtasks = allSubtasks.filter((subtask) => activeJobIds.has(subtask.job_id));

  return {
    data: {
      projects,
      jobs,
      entries,
      collaborators: activeCollaborators,
      timesheets,
      clients: activeClients,
      agendaEvents,
      subtasks,
    },
  };
}

export async function hashCollaboratorPassword(payload) {
  if (dataProvider !== 'supabase') {
    return maestro.functions.invoke('hashCollaboratorPassword', payload);
  }

  return { data: await invokeSupabaseFunction('hash-collaborator-password', payload) };
}

export async function getJobApproval(payload) {
  if (dataProvider === 'supabase') {
    return { data: await invokePublicSupabaseFunction('handle-job-approval', { ...payload, action: 'load' }) };
  }
  const jobs = await maestro.entities.Job.filter({ id: payload.jobId });
  return { data: { job: jobs[0] } };
}

export async function handleJobApproval(payload) {
  if (dataProvider === 'supabase') {
    return { data: await invokePublicSupabaseFunction('handle-job-approval', payload) };
  }
  return maestro.functions.invoke('handleJobApproval', payload);
}

// Temporary compatibility boundary for functions that have not been ported yet.
// Keeping this call here lets each function switch providers independently.
export function invokeMaestroFunction(name, payload) {
  return maestro.functions.invoke(name, payload);
}

export function getCurrentCollaborator() {
  try {
    return JSON.parse(sessionStorage.getItem('collaborator') || 'null');
  } catch {
    return null;
  }
}

export function logoutCollaborator() {
  sessionStorage.removeItem('collaborator');
  sessionStorage.removeItem('collaborator_session_token');
}

const authProvider = import.meta.env.VITE_MAESTRO_AUTH_PROVIDER || 'base44';

export const loginCollaborator = async (credentials) => {
  if (authProvider === 'supabase') {
    return loginCollaboratorWithSupabase(credentials);
  }
  return maestro.functions.invoke('collaboratorLogin', credentials);
};
