import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMetaAdsSyncCronHandler } from "../_shared/meta-ads-sync-cron.mjs";

const projectUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const supabase = createClient(projectUrl, serviceRoleKey);

Deno.serve(createMetaAdsSyncCronHandler({
  supabase,
  projectUrl,
  serviceRoleKey,
  sessionSecret,
}));
