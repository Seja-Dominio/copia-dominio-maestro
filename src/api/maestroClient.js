/**
 * Backend boundary for the Maestro application.
 *
 * Feature code must import `maestro` from this module. The current provider
 * remains isolated in base44Client while the Supabase provider is migrated
 * incrementally, keeping the application runnable during the transition.
 */
import { base44, getPublicSettings } from '@/api/base44Client';
import { createSupabaseEntities, loginCollaboratorWithSupabase } from '@/api/supabaseClient';

const dataProvider = import.meta.env.VITE_MAESTRO_DATA_PROVIDER || 'base44';

export const maestro = dataProvider === 'supabase'
  ? { ...base44, entities: createSupabaseEntities() }
  : base44;
export { getPublicSettings };

const authProvider = import.meta.env.VITE_MAESTRO_AUTH_PROVIDER || 'base44';

export const loginCollaborator = async (credentials) => {
  if (authProvider === 'supabase') {
    return loginCollaboratorWithSupabase(credentials);
  }
  return maestro.functions.invoke('collaboratorLogin', credentials);
};
