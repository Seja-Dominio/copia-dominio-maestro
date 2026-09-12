import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { createSupabaseEntities } from '@/api/supabaseEntityAdapter';
import { supabase } from '@/api/supabaseClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
const base44Client = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// During migration, opt into the landing-zone adapter with
// VITE_DATA_PROVIDER=supabase. Base44 remains the safe default until parity tests pass.
export const base44 = import.meta.env.VITE_DATA_PROVIDER === "supabase" && supabase
  ? { entities: createSupabaseEntities(), auth: base44Client.auth, functions: base44Client.functions, integrations: base44Client.integrations }
  : base44Client;
