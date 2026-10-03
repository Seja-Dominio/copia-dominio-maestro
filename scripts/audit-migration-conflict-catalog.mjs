import crypto from "node:crypto";
import pg from "pg";
import { assertConfirmedDevDatabaseTarget } from "./lib/verified-dev-database.mjs";

const targets = [{ envKey: "SUPABASE_DEV_DB_URL" }];

const functionNames = [
  "publish_imported_records",
  "enable_whatsapp_automation_scheduler",
  "maestro_apply_legacy_mutation",
  "rls_auto_enable",
  "resolve_job_task_reconciliation",
  "cxm_webhook_queue_enqueue",
  "create_organization_tenant",
];

const relationNames = [
  "maestro_financial_entries",
  "maestro_agenda_events",
  "maestro_timesheets",
  "maestro_notifications",
  "maestro_job_history",
  "maestro_webhook_receipts",
  "maestro_whatsapp_contacts",
  "maestro_whatsapp_groups",
  "maestro_bank_accounts",
  "maestro_financial_categories",
  "maestro_cost_centers",
  "maestro_job_templates",
  "maestro_proposals",
  "maestro_notes",
  "maestro_nps_entries",
  "maestro_nps_history",
  "maestro_job_comments",
  "maestro_webhook_parsed_messages",
  "maestro_dominus_query_logs",
  "maestro_dominus_sent_messages",
  "maestro_dominus_pending_messages",
  "maestro_mini_tasks",
  "maestro_delete_logs",
  "maestro_conversation_states",
  "maestro_audit_summaries",
  "maestro_system_audit_logs",
  "maestro_app_configs",
  "maestro_squads",
  "maestro_whatsapp_automations",
  "maestro_clients",
  "maestro_projects",
  "maestro_jobs",
  "maestro_job_tasks",
  "job_task_reconciliation",
  "maestro_collaborators",
  "maestro_ai_conversations",
  "maestro_ai_messages",
  "cxm_webhook_queue",
  "organizations",
  "organization_memberships",
  "jobs",
  "projects",
];

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const reports = [];
for (const target of targets) {
  const connectionString = process.env[target.envKey];
  if (!connectionString) throw new Error(`Missing ${target.envKey}`);
  const projectRef = assertConfirmedDevDatabaseTarget(connectionString, process.env.SUPABASE_CONFIRMED_DEV_PROJECT_REF);

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;
    const mode = await client.query("select current_setting($1) as mode", ["transaction_read_only"]);
    if (mode.rows[0]?.mode !== "on") throw new Error("Read-only transaction could not be confirmed");

    const functions = await client.query(
      `select p.proname as name,
              pg_get_function_identity_arguments(p.oid) as identity_arguments,
              p.prosecdef as security_definer,
              p.proconfig as configuration,
              pg_get_userbyid(p.proowner) as owner,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
              has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = $1 and p.proname = any($2::text[])
        order by p.proname, pg_get_function_identity_arguments(p.oid)`,
      ["public", functionNames],
    );

    const relations = await client.query(
      `select relname as name,
              relrowsecurity as rls_enabled,
              relforcerowsecurity as rls_forced,
              has_table_privilege('anon', oid, 'SELECT') as anon_select,
              has_table_privilege('authenticated', oid, 'SELECT') as authenticated_select,
              has_table_privilege('service_role', oid, 'SELECT') as service_role_select,
              has_table_privilege('service_role', oid, 'INSERT') as service_role_insert,
              has_table_privilege('service_role', oid, 'UPDATE') as service_role_update,
              has_table_privilege('service_role', oid, 'DELETE') as service_role_delete
         from pg_class
        where relnamespace = $1::regnamespace and relkind in ('r', 'p') and relname = any($2::text[])
        order by relname`,
      ["public", relationNames],
    );

    const policies = await client.query(
      `select tablename, policyname, permissive, roles, cmd,
              qual is not null as has_using_clause,
              with_check is not null as has_check_clause
         from pg_policies
        where schemaname = $1 and tablename = any($2::text[])
        order by tablename, policyname`,
      ["public", relationNames],
    );

    const registryAvailable = await client.query(
      "select to_regclass($1) is not null as available",
      ["public.legacy_cutover_registry"],
    );
    const productOwnership = registryAvailable.rows[0]?.available
      ? await client.query(
        `select relational_table as relation, module_key as product
           from public.legacy_cutover_registry
          where relational_table = any($1::text[])
          order by module_key, relational_table`,
        [relationNames],
      )
      : { rows: [] };

    const eventTriggers = await client.query(
      `select e.evtname as name, e.evtenabled as enabled, p.proname as function_name
         from pg_event_trigger e
         join pg_proc p on p.oid = e.evtfoid
        order by e.evtname`,
    );

    let cron = { available: false, selected_jobs: [] };
    const cronAvailable = await client.query("select to_regclass($1) is not null as available", ["cron.job"]);
    if (cronAvailable.rows[0]?.available) {
      const jobs = await client.query(
        `select jobname, schedule, active, command
           from cron.job
          where jobname = any($1::text[])
          order by jobname`,
        [["whatsapp_automation_runner", "cxm_webhook_queue_runner", "cxm_silence_due_jobs"]],
      );
      cron = {
        available: true,
        selected_jobs: jobs.rows.map(({ jobname, schedule, active, command }) => ({
          name: jobname,
          schedule,
          active,
          command_sha256: digest(command),
        })),
      };
    }

    reports.push({
      environment: target.envKey,
      project_ref: projectRef,
      transaction_read_only: mode.rows[0].mode,
      functions: functions.rows,
      relations: relations.rows,
      policies: policies.rows,
      registry_available: registryAvailable.rows[0]?.available || false,
      product_ownership: productOwnership.rows,
      event_triggers: eventTriggers.rows,
      cron,
    });
  } catch (error) {
    console.error(JSON.stringify({ environment: target.envKey, failure: error.code || error.name || "unknown" }));
    process.exitCode = 1;
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

if (reports.length) console.log(JSON.stringify({ read_only: true, reports }, null, 2));
