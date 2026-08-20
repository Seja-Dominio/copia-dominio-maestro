import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function loginCollaboratorWithSupabase({ login, password }) {
  if (!supabase) throw new Error('Supabase não está configurado neste ambiente.');

  const { data, error } = await supabase.functions.invoke('collaborator-login', {
    body: { login, password },
  });
  if (error) throw error;
  return { data };
}
