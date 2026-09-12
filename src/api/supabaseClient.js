import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const appEnvironment = import.meta.env.VITE_MAESTRO_ENV || (
  import.meta.env.MODE === 'production' ? 'production' :
    import.meta.env.MODE === 'test' ? 'test' : 'development'
);
const environmentUrls = {
  development: 'https://tqmfuskvllpqmvayjuqu.supabase.co',
  test: 'https://tqmfuskvllpqmvayjuqu.supabase.co',
  production: 'https://fwpisypiiezjhtqxlmqv.supabase.co',
};
const expectedUrl = environmentUrls[appEnvironment];
const unsafeTarget = expectedUrl && url !== expectedUrl;
export const isDevelopmentEnvironment = appEnvironment !== 'production' && url === environmentUrls.development;

function assertSafeTarget() {
  if (unsafeTarget) {
    throw new Error(`Ambiente ${appEnvironment} apontado para o projeto Supabase incorreto. Dev usa tqmf... e produção usa fwpis... Configure a URL correspondente antes de continuar.`);
  }
}

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

function clearStoredCollaboratorSession() {
  sessionStorage.removeItem('collaborator');
  sessionStorage.removeItem('collaborator_session_token');
  // A token from another Supabase environment must not keep the UI in an
  // apparently authenticated state after switching between Dev and Prod.
  supabase?.auth.signOut().catch(() => {});
}

function throwSupabaseError(data, response, fallback) {
  if (response.status === 401) {
    clearStoredCollaboratorSession();
    if (window.location.pathname !== '/') window.location.replace('/');
  }
  const error = new Error(data.error || fallback);
  error.status = response.status;
  error.details = data;
  throw error;
}

export async function invokeSupabaseFunction(name, body = {}) {
  assertSafeTarget();
  if (!url || !anonKey) throw new Error('Supabase não está configurado neste ambiente.');
  const sessionToken = sessionStorage.getItem('collaborator_session_token') || (await supabase?.auth.getSession())?.data?.session?.access_token;
  if (!sessionToken) throw new Error('Sessão do colaborador não encontrada.');

  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throwSupabaseError(data, response, `Erro ao executar ${name}.`);
  return data;
}

export async function askMaestroAI({ message, history = [], context = {} }) {
  try {
    const data = await invokeSupabaseFunction('maestro-ai', { message, history, context });
    return data.output || '';
  } catch (error) {
    return error?.message || 'Não foi possível consultar o ChatGPT agora.';
  }
}

export function invokeAdminTimesheetFunction(action, payload = {}) {
  return invokeSupabaseFunction('admin-timesheets', { action, ...payload });
}

export function invokeSystemReportFunction(action) {
  return invokeSupabaseFunction('system-reports', { action });
}

export function invokeSnapshotSync({ force = true, entities } = {}) {
  return invokeSupabaseFunction('sync-prod-snapshot', { action: 'sync', force, ...(entities ? { entities } : {}) }).then((data) => data.data);
}

export function invokeWhatsapp(payload) {
  return invokeSupabaseFunction('whatsapp-send', payload).then((data) => ({ data }));
}

export function transferSubtasks(payload = {}) {
  return invokeSupabaseFunction('maestro-data', {
    operation: 'transferSubtasks',
    entity: 'Subtask',
    ...payload,
  });
}

export async function invokePublicSupabaseFunction(name, body = {}) {
  assertSafeTarget();
  if (!url || !anonKey) throw new Error('Supabase não está configurado neste ambiente.');

  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Erro ao executar ${name}.`);
  return data;
}

export async function uploadFileToSupabase(file) {
  assertSafeTarget();
  if (!url || !anonKey) throw new Error('Supabase não está configurado neste ambiente.');
  const sessionToken = sessionStorage.getItem('collaborator_session_token');
  if (!sessionToken) throw new Error('Sessão do colaborador não encontrada.');

  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${url}/functions/v1/upload-file`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${sessionToken}`,
    },
    body: form,
  });
  const data = await response.json();
  if (!response.ok) throwSupabaseError(data, response, 'Erro ao enviar arquivo.');
  return data;
}

export async function loginCollaboratorWithSupabase({ login, password }) {
  assertSafeTarget();
  if (!supabase) throw new Error('Supabase não está configurado neste ambiente.');

  const { data, error } = await supabase.functions.invoke('collaborator-login', {
    body: { login, password },
  });
  if (error) {
    // The Supabase SDK keeps the Edge Function response in `context`; expose
    // its safe user-facing error instead of collapsing every failure to 500.
    let message = error.message;
    try {
      const response = error.context;
      const body = response?.json ? await response.json() : null;
      if (body?.error) message = body.error;
    } catch {
      // Keep the SDK message when the response body is unavailable.
    }
    throw new Error(message || 'Erro ao autenticar.');
  }
  return { data };
}

export async function callMaestroData(body) {
  assertSafeTarget();
  if (!url || !anonKey) throw new Error('Supabase não está configurado neste ambiente.');
  const sessionToken = sessionStorage.getItem('collaborator_session_token');
  if (!sessionToken) throw new Error('Sessão do colaborador não encontrada.');

  const response = await fetch(`${url}/functions/v1/maestro-data`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throwSupabaseError(data, response, 'Erro ao acessar os dados do Maestro.');
  return data.data;
}

function createEntityApi(entity) {
  return {
    // Keep list reads resilient while older deployed functions may wrap rows
    // as { data: [...] } instead of returning the array directly.
    list: async (sort, limit) => {
      const result = await callMaestroData({ operation: 'list', entity, sort, limit });
      return Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
    },
    filter: async (filters, sort, limit) => {
      const result = await callMaestroData({ operation: 'filter', entity, filters, sort, limit });
      return Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
    },
    create: (data) => callMaestroData({ operation: 'create', entity, data }),
    update: (id, data) => callMaestroData({ operation: 'update', entity, id, data }),
    delete: (id) => callMaestroData({ operation: 'delete', entity, id }),
    bulkCreate: (data) => callMaestroData({ operation: 'bulkCreate', entity, data }),
    subscribe: (callback) => {
      let stopped = false;
      let snapshot = new Map();

      const poll = async () => {
        try {
          const rows = await callMaestroData({ operation: 'list', entity, sort: '-created_date', limit: 1000 });
          const next = new Map(rows.map((row) => [row.id, row]));
          if (snapshot.size) {
            next.forEach((row, id) => {
              if (!snapshot.has(id)) callback({ type: 'create', id, data: row });
              else if (JSON.stringify(snapshot.get(id)) !== JSON.stringify(row)) callback({ type: 'update', id, data: row });
            });
            snapshot.forEach((row, id) => {
              if (!next.has(id)) callback({ type: 'delete', id, data: row });
            });
          }
          snapshot = next;
        } catch (error) {
          console.warn(`[Supabase] subscribe ${entity} failed`, error);
        }
      };

      poll();
      const interval = window.setInterval(() => { if (!stopped) poll(); }, 10000);
      return () => { stopped = true; window.clearInterval(interval); };
    },
  };
}

export function createSupabaseEntities() {
  return new Proxy({}, {
    get: (_target, entity) => createEntityApi(String(entity)),
  });
}
