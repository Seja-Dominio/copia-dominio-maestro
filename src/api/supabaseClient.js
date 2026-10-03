import { createClient } from '@supabase/supabase-js';
import { parseCollaboratorSession } from '@/lib/collaborator-session.mjs';
import { resolveMaestroSupabaseTarget } from '@/lib/maestro-environment.mjs';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const appEnvironment = import.meta.env.VITE_MAESTRO_ENV || (
  import.meta.env.MODE === 'production' ? 'production' :
    import.meta.env.MODE === 'test' ? 'test' : 'development'
);
const targetValidation = resolveMaestroSupabaseTarget({
  environment: appEnvironment,
  url,
  expectedDevProjectRef: import.meta.env.VITE_MAESTRO_DEV_PROJECT_REF,
});
const unsafeTarget = !targetValidation.safe;
export const isDevelopmentEnvironment = appEnvironment === 'development' && targetValidation.safe;
const relationalReadEntities = new Set(
  String(import.meta.env.VITE_MAESTRO_RELATIONAL_READS || '')
    .split(',')
    .map((entity) => entity.trim())
    .filter(Boolean),
);

const COLLABORATOR_STORAGE_KEY = 'collaborator';
const COLLABORATOR_TOKEN_STORAGE_KEY = 'collaborator_session_token';
const ENTITY_READ_CACHE_TTL = 15_000;
const entityReadCache = new Map();
const entityReadInflight = new Map();

function getStoredValue(key) {
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

export function getStoredSessionToken() {
  return getStoredValue(COLLABORATOR_TOKEN_STORAGE_KEY);
}

export function getStoredCollaborator() {
  const raw = getStoredValue(COLLABORATOR_STORAGE_KEY);
  const collaborator = parseCollaboratorSession(raw, getStoredSessionToken());
  if (!collaborator && (raw || getStoredSessionToken())) clearStoredCollaboratorSession();
  return collaborator;
}

export function storeCollaboratorSession(collaborator, token) {
  if (!collaborator?.id || !token) throw new Error('Resposta de autenticação incompleta.');
  const collaboratorJson = JSON.stringify(collaborator);
  sessionStorage.setItem(COLLABORATOR_STORAGE_KEY, collaboratorJson);
  localStorage.setItem(COLLABORATOR_STORAGE_KEY, collaboratorJson);
  if (token) {
    sessionStorage.setItem(COLLABORATOR_TOKEN_STORAGE_KEY, token);
    localStorage.setItem(COLLABORATOR_TOKEN_STORAGE_KEY, token);
  }
}

export function clearStoredCollaboratorSession() {
  sessionStorage.removeItem(COLLABORATOR_STORAGE_KEY);
  sessionStorage.removeItem(COLLABORATOR_TOKEN_STORAGE_KEY);
  localStorage.removeItem(COLLABORATOR_STORAGE_KEY);
  localStorage.removeItem(COLLABORATOR_TOKEN_STORAGE_KEY);
}

function getEntityReadIdentity() {
  try {
    return String(JSON.parse(getStoredValue(COLLABORATOR_STORAGE_KEY) || '{}')?.id || 'anonymous');
  } catch {
    return 'anonymous';
  }
}

function getEntityReadKey(body) {
  return `${getEntityReadIdentity()}:${JSON.stringify(body)}`;
}

function invalidateEntityReads(entity) {
  for (const key of entityReadCache.keys()) {
    if (key.includes(`"entity":"${entity}"`)) entityReadCache.delete(key);
  }
  for (const key of entityReadInflight.keys()) {
    if (key.includes(`"entity":"${entity}"`)) entityReadInflight.delete(key);
  }
}

async function readEntity(body, { cache = true } = {}) {
  const key = getEntityReadKey(body);
  const now = Date.now();
  if (cache) {
    const cached = entityReadCache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached) entityReadCache.delete(key);
    const inflight = entityReadInflight.get(key);
    if (inflight) return inflight;
  }

  const request = callMaestroData(body, { includeMetadata: true }).then((result) => {
    const value = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
    if (body.read_source === 'relational' && result?.read_source !== 'relational') {
      console.warn(`[Maestro] ${body.entity} continuou em legacy: filtro/capacidade relacional não suportados nesta consulta.`);
    }
    if (cache) entityReadCache.set(key, { value, expiresAt: Date.now() + ENTITY_READ_CACHE_TTL });
    return value;
  }).finally(() => entityReadInflight.delete(key));

  if (cache) entityReadInflight.set(key, request);
  return request;
}

function assertSafeTarget() {
  if (unsafeTarget) {
    throw new Error(targetValidation.error || `O destino Supabase do ambiente ${appEnvironment} não foi confirmado; nenhuma chamada foi enviada.`);
  }
}

export const supabase = url && anonKey && targetValidation.safe ? createClient(url, anonKey) : null;

function throwSupabaseError(data, response, fallback, { clearSessionOnUnauthorized = true } = {}) {
  if (response.status === 401 && clearSessionOnUnauthorized) {
    clearStoredCollaboratorSession();
    if (window.location.pathname !== '/') window.location.replace('/');
  }
  const error = new Error(data.error || fallback);
  error.status = response.status;
  error.details = data;
  throw error;
}

export async function invokeSupabaseFunction(name, body = {}, options = {}) {
  assertSafeTarget();
  if (!url || !anonKey) throw new Error('Supabase não está configurado neste ambiente.');
  const sessionToken = getStoredSessionToken();
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
  if (!response.ok) throwSupabaseError(data, response, `Erro ao executar ${name}.`, options);
  return data;
}

export async function askMaestroAI({ message, history = [], context = {}, response_json_schema }) {
  try {
    const data = await invokeSupabaseFunction('maestro-ai', { message, history, context, response_json_schema });
    return data.output || '';
  } catch (error) {
    return error?.message || 'Não foi possível consultar o ChatGPT agora.';
  }
}

export function invokeTrafficCopilot(body = {}) {
  // A falha do Copiloto deve aparecer no painel. Ela não pode derrubar a
  // sessão inteira, especialmente enquanto uma versão remota é atualizada.
  return invokeSupabaseFunction('traffic-copilot', body, { clearSessionOnUnauthorized: false });
}

export function invokeAdminTimesheetFunction(action, payload = {}) {
  return invokeSupabaseFunction('admin-timesheets', { action, ...payload });
}

export function invokeSystemReportFunction(action) {
  return invokeSupabaseFunction('system-reports', { action });
}

export function invokeDominusMemoryFunction(action, payload = {}) {
  return invokeSupabaseFunction('dominus-memory', { action, ...payload });
}

export function invokeDominusAuditFunction(action, payload = {}) {
  return invokeSupabaseFunction('dominus-audit', { action, ...payload });
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
  const sessionToken = getStoredSessionToken();
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

export function refreshFileUrlFromSupabase(path, jobId) {
  return invokeSupabaseFunction('refresh-file-url', { path, job_id: jobId }).then((data) => data.file_url || '');
}

export async function loginCollaboratorWithSupabase({ login, password, organization_id }) {
  assertSafeTarget();
  if (!supabase) throw new Error('Supabase não está configurado neste ambiente.');

  const { data, error } = await supabase.functions.invoke('collaborator-login', {
    body: { login, password, ...(organization_id ? { organization_id } : {}) },
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

export async function callMaestroData(body, { includeMetadata = false } = {}) {
  assertSafeTarget();
  if (!url || !anonKey) throw new Error('Supabase não está configurado neste ambiente.');
  const sessionToken = getStoredSessionToken();
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
  return includeMetadata ? data : data.data;
}

function createEntityApi(entity) {
  const withReadSource = (body) => relationalReadEntities.has(entity)
    ? { ...body, read_source: 'relational' }
    : body;
  return {
    list: (sort, limit, options = {}) => readEntity(withReadSource({ operation: 'list', entity, sort, limit, ...(options.offset != null ? { offset: options.offset } : {}) })),
    filter: (filters, sort, limit, options = {}) => readEntity(withReadSource({ operation: 'filter', entity, filters, sort, limit, ...(options.offset != null ? { offset: options.offset } : {}) })),
    create: async (data) => { const result = await callMaestroData({ operation: 'create', entity, data }); invalidateEntityReads(entity); return result; },
    update: async (id, data) => { const result = await callMaestroData({ operation: 'update', entity, id, data }); invalidateEntityReads(entity); return result; },
    delete: async (id) => { const result = await callMaestroData({ operation: 'delete', entity, id }); invalidateEntityReads(entity); return result; },
    bulkCreate: async (data) => { const result = await callMaestroData({ operation: 'bulkCreate', entity, data }); invalidateEntityReads(entity); return result; },
    subscribe: (callback, { intervalMs = 30_000, limit = 1000, filters, sort = '-created_date' } = {}) => {
      let stopped = false;
      let snapshot = new Map();

      const poll = async () => {
        try {
          const body = withReadSource(filters
            ? { operation: 'filter', entity, filters, sort, limit }
            : { operation: 'list', entity, sort, limit });
          const rows = await readEntity(body, { cache: false });
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
      const interval = window.setInterval(() => { if (!stopped) poll(); }, intervalMs);
      return () => { stopped = true; window.clearInterval(interval); };
    },
  };
}

export function createSupabaseEntities() {
  return new Proxy({}, {
    get: (_target, entity) => createEntityApi(String(entity)),
  });
}
