import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function invokeSupabaseFunction(name, body = {}) {
  if (!url || !anonKey) throw new Error('Supabase não está configurado neste ambiente.');
  const sessionToken = sessionStorage.getItem('collaborator_session_token');
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
  if (!response.ok) throw new Error(data.error || `Erro ao executar ${name}.`);
  return data;
}

export async function loginCollaboratorWithSupabase({ login, password }) {
  if (!supabase) throw new Error('Supabase não está configurado neste ambiente.');

  const { data, error } = await supabase.functions.invoke('collaborator-login', {
    body: { login, password },
  });
  if (error) throw error;
  return { data };
}

async function callMaestroData(body) {
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
  if (!response.ok) throw new Error(data.error || 'Erro ao acessar os dados do Maestro.');
  return data.data;
}

function createEntityApi(entity) {
  return {
    list: (sort, limit) => callMaestroData({ operation: 'list', entity, sort, limit }),
    filter: (filters, sort, limit) => callMaestroData({ operation: 'filter', entity, filters, sort, limit }),
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
