/**
 * Backend boundary for the Maestro application.
 *
 * Feature code must import `maestro` from this module. Runtime data,
 * authentication, files, and functions are provided by Supabase only.
 */
import { callMaestroData, createSupabaseEntities, getStoredCollaborator, invokeAdminTimesheetFunction, invokePublicSupabaseFunction, invokeSupabaseFunction, invokeSystemReportFunction, invokeWhatsapp, loginCollaboratorWithSupabase, refreshFileUrlFromSupabase, transferSubtasks as transferSubtasksSupabase, uploadFileToSupabase, clearStoredCollaboratorSession } from '@/api/supabaseClient';
import { resolveMaestroProvider } from '@/api/maestro-provider.mjs';

resolveMaestroProvider(import.meta.env.VITE_MAESTRO_DATA_PROVIDER);

export const maestro = { entities: createSupabaseEntities() };

export async function getDashboardData({ collaborator_id } = {}) {
  const dashboard = await callMaestroData({ operation: 'dashboard', collaborator_id });
  const {
    projects = [],
    jobs: allJobs = [],
    entries = [],
    collaborators: allCollaborators = [],
    timesheets = [],
    clients: allClients = [],
    agendaEvents: allAgendaEvents = [],
    subtasks: allSubtasks = [],
  } = dashboard || {};

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
  return { data: await invokeSupabaseFunction('hash-collaborator-password', payload) };
}

export async function getJobApproval(payload) {
  return { data: await invokePublicSupabaseFunction('handle-job-approval', { ...payload, action: 'load' }) };
}

export async function handleJobApproval(payload) {
  return { data: await invokePublicSupabaseFunction('handle-job-approval', payload) };
}

export async function uploadMaestroFile(file) {
  return uploadFileToSupabase(file);
}

export function refreshMaestroFileUrl(path, jobId) {
  if (!path || !jobId) return Promise.resolve('');
  return refreshFileUrlFromSupabase(path, jobId);
}

export async function transferSubtasks(payload) {
  return transferSubtasksSupabase(payload);
}

// Only explicitly mapped Supabase functions may be invoked. Unsupported names
// fail closed instead of being sent to another backend.
export function invokeMaestroFunction(name, payload) {
  if (name === 'sendWhatsapp' || name === 'sendWhatsappFile') return invokeWhatsapp(payload);
  if (name === 'listWhatsappGroups') return invokeWhatsapp({ action: 'listGroups' });
  if (name === 'listWhatsappContacts') return invokeWhatsapp({ action: 'listContacts' });
  if (name === 'syncWhatsappDirectory') return invokeWhatsapp({ action: 'syncDirectory' });
  if (name === 'listWhatsappDirectory') return invokeWhatsapp({ action: 'listDirectory' });
  if (name === 'linkWhatsappClient') return invokeWhatsapp({ action: 'linkClient', ...payload });
  if (name === 'whatsappConnect') return invokeWhatsapp({ action: 'connect' });
  if (name === 'whatsappStatus') return invokeWhatsapp({ action: 'status' });
  if (name === 'listWhatsappAutomations') return invokeWhatsapp({ action: 'listAutomations' });
  if (name === 'configureWhatsappDominusWebhook') return invokeWhatsapp({ action: 'configureDominusWebhook' });
  if (name === 'saveWhatsappAutomation') return invokeWhatsapp({ action: 'saveAutomation', automation: payload });
  if (name === 'deleteWhatsappAutomation') return invokeWhatsapp({ action: 'deleteAutomation', ...payload });
  if (name === 'teamChat') return invokeSupabaseFunction('team-chat', payload).then((data) => ({ data: data.data || data }));
  if (name === 'deleteTimesheet') return invokeAdminTimesheetFunction('delete', { timesheetId: payload?.timesheetId });
  if (name === 'clearAllTimesheets') return invokeAdminTimesheetFunction('clear');
  if (name === 'resetAllTimesheets') return invokeAdminTimesheetFunction('reset');
  if (name === 'generateSystemReport') return invokeSystemReportFunction('report').then((data) => ({ data }));
  if (name === 'exportSystemBlueprint') return invokeSystemReportFunction('blueprint').then((data) => ({ data }));
  return Promise.reject(new Error(`A função "${name}" não está disponível no provider Supabase.`));
}

export const isMaestroSupabaseProvider = true;

export function invokeCompetitiveReport(payload = {}) {
  return invokeSupabaseFunction('meta-ads-oauth', { action: 'competitor_report', ...payload });
}

export function getCurrentCollaborator() {
  return getStoredCollaborator();
}

export function logoutCollaborator() {
  clearStoredCollaboratorSession();
}

export const loginCollaborator = (credentials) => loginCollaboratorWithSupabase(credentials);
