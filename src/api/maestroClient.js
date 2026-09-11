/**
 * Backend boundary for the Maestro application.
 *
 * Feature code must import `maestro` from this module. The current provider
 * remains isolated in base44Client while the Supabase provider is migrated
 * incrementally, keeping the application runnable during the transition.
 */
import { base44, getPublicSettings } from '@/api/base44Client';
import { createSupabaseEntities, invokeAdminTimesheetFunction, invokePublicSupabaseFunction, invokeSupabaseFunction, invokeSystemReportFunction, invokeWhatsapp, loginCollaboratorWithSupabase, transferSubtasks as transferSubtasksSupabase, uploadFileToSupabase } from '@/api/supabaseClient';

const dataProvider = import.meta.env.VITE_MAESTRO_DATA_PROVIDER || 'base44';

// Do not spread the SDK client here: it contains an enumerable `asServiceRole`
// getter that is intentionally unavailable in the browser and causes a blank
// screen before React can render. Keep only the client modules still used by
// compatibility routes while the data/auth paths run through Supabase.
export const maestro = dataProvider === 'supabase'
  ? { auth: base44.auth, functions: base44.functions, integrations: base44.integrations, entities: createSupabaseEntities() }
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

export async function uploadMaestroFile(file) {
  if (dataProvider === 'supabase') {
    return uploadFileToSupabase(file);
  }
  return maestro.integrations.Core.UploadFile({ file });
}

export async function transferSubtasks(payload) {
  if (dataProvider === 'supabase') return transferSubtasksSupabase(payload);
  return maestro.functions.invoke('transferSubtasks', payload);
}

// Temporary compatibility boundary for functions that have not been ported yet.
// Keeping this call here lets each function switch providers independently.
export function invokeMaestroFunction(name, payload) {
  if (dataProvider === 'supabase') {
    if (name === 'sendWhatsapp') return invokeWhatsapp(payload);
    if (name === 'sendWhatsappFile') return invokeWhatsapp(payload);
    if (name === 'listWhatsappGroups') return invokeWhatsapp({ action: 'listGroups' });
    if (name === 'listWhatsappContacts') return invokeWhatsapp({ action: 'listContacts' });
    if (name === 'syncWhatsappDirectory') return invokeWhatsapp({ action: 'syncDirectory' });
    if (name === 'listWhatsappDirectory') return invokeWhatsapp({ action: 'listDirectory' });
    if (name === 'linkWhatsappClient') return invokeWhatsapp({ action: 'linkClient', ...payload });
    if (name === 'whatsappConnect') return invokeWhatsapp({ action: 'connect' });
    if (name === 'whatsappStatus') return invokeWhatsapp({ action: 'status' });
    if (name === 'listWhatsappAutomations') return invokeWhatsapp({ action: 'listAutomations' });
    if (name === 'saveWhatsappAutomation') return invokeWhatsapp({ action: 'saveAutomation', automation: payload });
    if (name === 'deleteWhatsappAutomation') return invokeWhatsapp({ action: 'deleteAutomation', ...payload });
    if (name === 'deleteTimesheet') return invokeAdminTimesheetFunction('delete', { timesheetId: payload?.timesheetId });
    if (name === 'clearAllTimesheets') return invokeAdminTimesheetFunction('clear');
    if (name === 'resetAllTimesheets') return invokeAdminTimesheetFunction('reset');
    if (name === 'generateSystemReport') return invokeSystemReportFunction('report').then((data) => ({ data }));
    if (name === 'exportSystemBlueprint') return invokeSystemReportFunction('blueprint').then((data) => ({ data }));
  }
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
