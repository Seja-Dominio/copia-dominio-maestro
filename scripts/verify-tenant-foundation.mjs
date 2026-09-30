import pg from "pg";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getIsolatedTestDatabaseSsl, getIsolatedTestDatabaseUrl } from "./lib/isolated-test-database.mjs";
import {
  validateRelationalReferenceContracts,
  validateTenantForeignKeyContracts,
} from "./lib/relational-reference-contracts.mjs";

let databaseUrl;
try {
  databaseUrl = getIsolatedTestDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: getIsolatedTestDatabaseSsl(databaseUrl) });
const failures = [];
const referenceContractsPath = fileURLToPath(new URL("./config/relational-reference-contracts.json", import.meta.url));
const referenceContracts = JSON.parse(await fs.readFile(referenceContractsPath, "utf8"));
const tables = [
  "maestro_clients", "maestro_projects", "maestro_jobs", "maestro_job_tasks",
  "maestro_financial_entries", "maestro_agenda_events", "maestro_timesheets",
  "maestro_notifications", "maestro_job_history", "maestro_webhook_receipts",
  "organization_legacy_records", "organization_integrations", "job_task_reconciliation",
  "relational_integrity_exceptions", "maestro_ads_accounts", "maestro_ads_authorizations",
  "team_chat_channels", "team_chat_messages", "team_chat_message_reactions", "marketing_mix_observations",
  "dominus_memory", "dominus_learning_reviews", "dominus_learning_review_comments",
  "dominus_learning_review_events", "dominus_audit_runs", "dominus_audit_findings",
  "maestro_whatsapp_contacts", "maestro_whatsapp_groups",
  "maestro_bank_accounts", "maestro_financial_categories", "maestro_cost_centers",
  "maestro_job_templates", "maestro_proposals", "maestro_notes",
  "maestro_nps_entries", "maestro_nps_history",
  "maestro_job_comments",
  "maestro_webhook_parsed_messages",
  "maestro_dominus_query_logs", "maestro_dominus_sent_messages", "maestro_dominus_pending_messages",
  "maestro_mini_tasks", "maestro_delete_logs",
  "maestro_conversation_states", "maestro_audit_summaries", "maestro_system_audit_logs", "maestro_app_configs", "maestro_squads",
  "maestro_whatsapp_automations",
];
const serverManagedTables = [
  "job_task_reconciliation",
  "maestro_ai_query_logs",
  "maestro_collaborators",
  "organization_integrations",
  "organization_legacy_records",
  "organization_products",
  "organizations",
  "relational_integrity_exceptions",
  "team_chat_channels",
  "team_chat_message_reactions",
  "team_chat_messages",
];
const deployedWebhookDependencies = [
  "cxm_webhook_queue_enqueue",
  "cxm_webhook_queue_read",
  "cxm_webhook_queue_complete",
  "cxm_webhook_queue_fail",
  "cxm_webhook_worker_authorized",
  "cxm_silence_due_claim",
  "cxm_silence_due_fail",
];

try {
  await client.connect();
  await client.query("begin read only");
  const session = await client.query("select current_setting('transaction_read_only') as read_only");
  if (session.rows[0]?.read_only !== "on") throw new Error("Tenant-foundation verifier must run in a read-only transaction.");
  const tableResult = await client.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled,
      exists (select 1 from information_schema.columns col
        where col.table_schema='public' and col.table_name=c.relname
          and col.column_name='organization_id' and col.is_nullable='NO') as organization_not_null
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname = any($1::text[])
  `, [tables]);
  const tableMap = new Map(tableResult.rows.map((row) => [row.table_name, row]));
  for (const table of tables) {
    const row = tableMap.get(table);
    if (!row) failures.push(`${table}: missing`);
    else {
      if (!row.rls_enabled) failures.push(`${table}: rls_disabled`);
      if (!row.organization_not_null) failures.push(`${table}: organization_id_not_null_missing`);
    }
  }

  const scope = await client.query(`select
    (select count(*) from public.legacy_records) as legacy_records,
    (select count(*) from public.legacy_records where organization_id is null) as unscoped_legacy_records,
    (select count(*) from public.organization_legacy_records) as organization_legacy_records,
    (select count(*) from public.organizations where status='active') as active_organizations`);
  const scopeRow = scope.rows[0];
  if (Number(scopeRow.unscoped_legacy_records) !== 0) failures.push(`unscoped_legacy_records=${scopeRow.unscoped_legacy_records}`);
  if (Number(scopeRow.legacy_records) !== Number(scopeRow.organization_legacy_records)) failures.push(`legacy_scope_mapping=${scopeRow.organization_legacy_records}/${scopeRow.legacy_records}`);

  const legacyAccess = await client.query(`
    select
      has_table_privilege('anon', 'public.legacy_records', 'SELECT') as anon_select,
      has_table_privilege('authenticated', 'public.legacy_records', 'SELECT') as authenticated_select,
      has_table_privilege('anon', 'public.legacy_records', 'INSERT') as anon_insert,
      has_table_privilege('authenticated', 'public.legacy_records', 'INSERT') as authenticated_insert,
      has_table_privilege('anon', 'public.legacy_records', 'UPDATE') as anon_update,
      has_table_privilege('authenticated', 'public.legacy_records', 'UPDATE') as authenticated_update,
      has_table_privilege('anon', 'public.legacy_records', 'DELETE') as anon_delete,
      has_table_privilege('authenticated', 'public.legacy_records', 'DELETE') as authenticated_delete,
      has_table_privilege('anon', 'public.legacy_records', 'TRUNCATE') as anon_truncate,
      has_table_privilege('authenticated', 'public.legacy_records', 'TRUNCATE') as authenticated_truncate,
      has_table_privilege('anon', 'public.legacy_records', 'REFERENCES') as anon_references,
      has_table_privilege('authenticated', 'public.legacy_records', 'REFERENCES') as authenticated_references,
      has_table_privilege('anon', 'public.legacy_records', 'TRIGGER') as anon_trigger,
      has_table_privilege('authenticated', 'public.legacy_records', 'TRIGGER') as authenticated_trigger,
      has_table_privilege('service_role', 'public.legacy_records', 'SELECT') as service_select
  `);
  const legacySelectPolicy = await client.query(`
    select policyname, cmd, roles
    from pg_policies
    where schemaname='public' and tablename='legacy_records'
      and cmd in ('SELECT', 'ALL')
      and roles && array['anon', 'authenticated', 'public']::name[]
  `);
  if (legacyAccess.rows[0].anon_select || legacyAccess.rows[0].authenticated_select) {
    failures.push("legacy_records:direct_client_select_granted");
  }
  const legacyClientPrivileges = ["anon_insert", "authenticated_insert", "anon_update", "authenticated_update",
    "anon_delete", "authenticated_delete", "anon_truncate", "authenticated_truncate", "anon_references",
    "authenticated_references", "anon_trigger", "authenticated_trigger"];
  for (const privilege of legacyClientPrivileges) {
    if (legacyAccess.rows[0][privilege]) failures.push(`legacy_records:unexpected_client_privilege:${privilege}`);
  }
  if (!legacyAccess.rows[0].service_select) failures.push("legacy_records:service_role_select_missing");
  if (legacySelectPolicy.rows.length) failures.push("legacy_records:direct_client_select_policy_present");

  const legacyIndirectAccess = await client.query(`
    select 'view' as object_type, schemaname || '.' || viewname as object_name,
      has_table_privilege('anon', format('%I.%I', schemaname, viewname), 'SELECT') as anon_access,
      has_table_privilege('authenticated', format('%I.%I', schemaname, viewname), 'SELECT') as authenticated_access
    from pg_views
    where schemaname='public' and definition ilike '%legacy_records%'
    union all
    select 'security_definer_function' as object_type, n.nspname || '.' || p.proname as object_name,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_access,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_access
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and pg_get_functiondef(p.oid) ilike '%legacy_records%'
  `);
  for (const path of legacyIndirectAccess.rows) {
    if (path.anon_access || path.authenticated_access) {
      failures.push(`${path.object_type}:${path.object_name}:legacy_records_client_access`);
    }
  }

  const serverManagedCheck = await client.query(`
    select expected.table_name,
      coalesce(c.relrowsecurity, false) as rls_enabled,
      exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=expected.table_name) as has_policy
    from unnest($1::text[]) as expected(table_name)
    left join pg_class c on c.relname=expected.table_name
      and c.relnamespace='public'::regnamespace
  `, [serverManagedTables]);
  for (const table of serverManagedCheck.rows) {
    if (table.rls_enabled !== true) failures.push(`${table.table_name}:server_managed_rls_missing`);
    if (table.has_policy) failures.push(`${table.table_name}:unexpected_client_policy`);
  }

  const membershipAccess = await client.query(`
    select c.relrowsecurity as rls_enabled,
      has_table_privilege('authenticated', 'public.organization_members', 'SELECT') as authenticated_select,
      has_table_privilege('anon', 'public.organization_members', 'SELECT') as anon_select,
      has_table_privilege('authenticated', 'public.organization_members', 'INSERT') as authenticated_insert,
      has_table_privilege('authenticated', 'public.organization_members', 'UPDATE') as authenticated_update,
      has_table_privilege('authenticated', 'public.organization_members', 'DELETE') as authenticated_delete,
      has_table_privilege('authenticated', 'public.organization_members', 'TRUNCATE') as authenticated_truncate,
      has_table_privilege('authenticated', 'public.organization_members', 'REFERENCES') as authenticated_references,
      has_table_privilege('authenticated', 'public.organization_members', 'TRIGGER') as authenticated_trigger,
      exists (
        select 1 from pg_policies p
        where p.schemaname='public' and p.tablename='organization_members'
          and p.policyname='organization_members_self_read' and p.cmd='SELECT'
          and p.roles && array['authenticated'::name]
      ) as self_read_policy
    from pg_class c
    where c.oid='public.organization_members'::regclass
  `);
  const membership = membershipAccess.rows[0];
  if (!membership?.rls_enabled) failures.push("organization_members:rls_disabled");
  if (!membership?.authenticated_select || !membership?.self_read_policy || membership?.anon_select) failures.push("organization_members:self_read_policy_or_grant_missing_or_anon_access");
  if (membership?.authenticated_insert || membership?.authenticated_update || membership?.authenticated_delete
    || membership?.authenticated_truncate || membership?.authenticated_references || membership?.authenticated_trigger) {
    failures.push("organization_members:unexpected_client_write_grant");
  }

  const tenantForeignKeys = await client.query(`
    with expected(table_name, constraint_name) as (
      values
        ('maestro_projects', 'maestro_projects_org_client_fk'),
        ('maestro_projects', 'maestro_projects_org_client_identity_fk'),
        ('maestro_jobs', 'maestro_jobs_org_project_fk'),
        ('maestro_jobs', 'maestro_jobs_org_project_identity_fk'),
        ('maestro_jobs', 'maestro_jobs_org_client_fk'),
        ('maestro_jobs', 'maestro_jobs_org_client_identity_fk'),
        ('maestro_job_tasks', 'maestro_job_tasks_org_job_fk'),
        ('maestro_job_tasks', 'maestro_job_tasks_org_responsible_fk'),
        ('maestro_agenda_events', 'maestro_agenda_events_org_collaborator_fk'),
        ('maestro_timesheets', 'maestro_timesheets_org_job_fk'),
        ('maestro_timesheets', 'maestro_timesheets_org_client_identity_fk'),
        ('maestro_timesheets', 'maestro_timesheets_org_project_identity_fk'),
        ('maestro_mini_tasks', 'maestro_mini_tasks_org_collaborator_fk')
    )
    select expected.table_name, expected.constraint_name,
      constraint_row.convalidated as validated,
      pg_get_constraintdef(constraint_row.oid) as definition
    from expected
    left join pg_class relation on relation.relname=expected.table_name
      and relation.relnamespace='public'::regnamespace
    left join pg_constraint constraint_row on constraint_row.conrelid=relation.oid
      and constraint_row.conname=expected.constraint_name
  `);
  for (const constraint of tenantForeignKeys.rows) {
    if (constraint.validated !== true || !constraint.definition?.includes("organization_id")) {
      failures.push(`${constraint.constraint_name}:tenant_fk_missing_or_unvalidated`);
    }
  }

  const tenantFkCoverage = await client.query(`
    with tenant_tables as (
      select c.oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p')
        and exists (
          select 1 from pg_attribute a
          where a.attrelid=c.oid and a.attname='organization_id'
            and a.attnum > 0 and not a.attisdropped
        )
    ), foreign_keys as (
      select con.oid, con.conname, con.conrelid, con.confrelid,
        child.relname as child_table, parent.relname as parent_table,
        con.convalidated as validated,
        array(
          select a.attname::text
          from unnest(con.conkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum
          order by k.ord
        ) as child_columns,
        array(
          select a.attname::text
          from unnest(con.confkey) with ordinality k(attnum, ord)
          join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.attnum
          order by k.ord
        ) as parent_columns
      from pg_constraint con
      join tenant_tables child on child.oid=con.conrelid
      join tenant_tables parent on parent.oid=con.confrelid
      where con.contype='f'
    )
    select source.child_table, source.conname, source.child_columns,
      source.parent_table, source.parent_columns, source.validated,
      exists (
        select 1 from foreign_keys scoped
        where scoped.child_table=source.child_table
          and scoped.parent_table=source.parent_table
          and 'organization_id'=any(scoped.child_columns)
          and 'organization_id'=any(scoped.parent_columns)
          and array_remove(scoped.child_columns, 'organization_id')
            = array_remove(source.child_columns, 'organization_id')
          and array_remove(scoped.parent_columns, 'organization_id')
            = array_remove(source.parent_columns, 'organization_id')
          and scoped.validated
      ) as equivalent_validated_tenant_fk
    from foreign_keys source
    where not ('organization_id'=any(source.child_columns)
      and 'organization_id'=any(source.parent_columns))
    order by source.child_table, source.conname
  `);
  for (const relation of tenantFkCoverage.rows) {
    if (relation.validated !== true || relation.equivalent_validated_tenant_fk !== true) {
      failures.push(`${relation.child_table}.${relation.conname}:equivalent_validated_tenant_fk_missing`);
    }
  }

  const referenceColumns = await client.query(`
    select table_name as table, column_name as column
    from information_schema.columns
    where table_schema='public'
      and (column_name like '%\\_legacy\\_record\\_id' escape '\\'
        or column_name like '%\\_legacy\\_id' escape '\\'
        or column_name like 'legacy\\_%\\_record\\_id' escape '\\')
      and column_name <> 'legacy_record_id'
    order by table_name, column_name
  `);
  failures.push(...validateRelationalReferenceContracts(referenceColumns.rows, referenceContracts));
  const requiredReferenceFks = referenceContracts.filter((entry) =>
    ["tenant_fk_required", "tenant_fk_enforced"].includes(entry.disposition)
      && entry.target_table && entry.target_column);
  const expectedReferenceFks = requiredReferenceFks.map((entry) => ({
    table_name: entry.table,
    column_name: entry.column,
    target_table: entry.target_table,
    target_column: entry.target_column,
  }));
  const referenceFks = await client.query(`
    with expected as (
      select * from jsonb_to_recordset($1::jsonb) as e(
        table_name text, column_name text, target_table text, target_column text
      )
    )
    select expected.table_name as table, expected.column_name as column,
      expected.target_table, expected.target_column,
      exists (
        select 1 from pg_constraint con
        join pg_class child on child.oid=con.conrelid
        join pg_namespace child_ns on child_ns.oid=child.relnamespace
        join pg_class parent on parent.oid=con.confrelid
        join pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
        where con.contype='f' and con.convalidated
          and child_ns.nspname='public' and child.relname=expected.table_name
          and parent_ns.nspname='public' and parent.relname=expected.target_table
          and array(
            select a.attname::text from unnest(con.conkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum order by k.ord
          ) = array['organization_id', expected.column_name]
          and array(
            select a.attname::text from unnest(con.confkey) with ordinality k(attnum, ord)
            join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.attnum order by k.ord
          ) = array['organization_id', expected.target_column]
      ) as validated
    from expected order by expected.table_name, expected.column_name
  `, [JSON.stringify(expectedReferenceFks)]);
  failures.push(...validateTenantForeignKeyContracts(requiredReferenceFks, referenceFks.rows));

  const webhookSchema = await client.query(`
    select name, to_regclass(format('public.%I', name)) is not null as exists,
      coalesce((select c.relrowsecurity from pg_class c where c.oid=to_regclass(format('public.%I', name))), false) as rls_enabled
    from unnest(array['cxm_webhook_event_receipts', 'cxm_silence_due_jobs']::text[]) as expected(name)
  `);
  for (const relation of webhookSchema.rows) {
    if (relation.exists !== true) failures.push(`${relation.name}:deployed_webhook_dependency_missing`);
    if (relation.exists && relation.rls_enabled !== true) failures.push(`${relation.name}:rls_disabled`);
  }

  const webhookFunctions = await client.query(`
    select expected.name, p.oid is not null as exists,
      coalesce(has_function_privilege('service_role', p.oid, 'EXECUTE'), false) as service_role_execute,
      coalesce(has_function_privilege('anon', p.oid, 'EXECUTE'), false) as anon_execute,
      coalesce(has_function_privilege('authenticated', p.oid, 'EXECUTE'), false) as authenticated_execute
    from unnest($1::text[]) as expected(name)
    left join pg_proc p on p.proname=expected.name
      and p.pronamespace='public'::regnamespace
  `, [deployedWebhookDependencies]);
  for (const fn of webhookFunctions.rows) {
    if (fn.exists !== true) failures.push(`${fn.name}:deployed_webhook_dependency_missing`);
    if (fn.exists && fn.service_role_execute !== true) failures.push(`${fn.name}:service_role_execute_missing`);
    if (fn.anon_execute || fn.authenticated_execute) failures.push(`${fn.name}:client_execute_granted`);
  }

  const unmanagedTablePrivileges = await client.query(`
    select c.relname as table_name, r.grantee, p.privilege
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'::name), ('authenticated'::name)) as r(grantee)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege)
    where n.nspname='public' and c.relkind='r' and c.relrowsecurity
      and not exists (
        select 1 from pg_policies policy
        where policy.schemaname='public' and policy.tablename=c.relname
      )
      and has_table_privilege(r.grantee, format('public.%I', c.relname), p.privilege)
    order by c.relname, r.grantee, p.privilege
  `);
  for (const grant of unmanagedTablePrivileges.rows) {
    failures.push(`${grant.table_name}:${grant.grantee}_has_${grant.privilege.toLowerCase()}_without_policy`);
  }

  const publicClientPrivileges = await client.query(`
    select c.relname as object_name, r.grantee, p.privilege
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'::name), ('authenticated'::name)) as r(grantee)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege)
    where n.nspname='public' and c.relkind in ('r','p')
      and has_table_privilege(r.grantee, c.oid, p.privilege)
      and not (c.relname='organization_members' and r.grantee='authenticated' and p.privilege='SELECT')
    union all
    select c.relname as object_name, r.grantee, p.privilege
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'::name), ('authenticated'::name)) as r(grantee)
    cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(privilege)
    where n.nspname='public' and c.relkind='S'
      and has_sequence_privilege(r.grantee, c.oid, p.privilege)
  `);
  for (const privilege of publicClientPrivileges.rows) {
    failures.push(`${privilege.object_name}:${privilege.grantee}_has_unapproved_${privilege.privilege.toLowerCase()}`);
  }

  const defaultClientPrivileges = await client.query(`
    select owner_role.rolname as owner, defaults.defaclobjtype as object_type,
      coalesce(grantee_role.rolname, 'PUBLIC') as grantee, acl.privilege_type
    from pg_default_acl defaults
    cross join lateral aclexplode(defaults.defaclacl) acl
    join pg_roles owner_role on owner_role.oid=defaults.defaclrole
    left join pg_roles grantee_role on grantee_role.oid=acl.grantee
    where (defaults.defaclnamespace='public'::regnamespace or defaults.defaclnamespace=0)
      and defaults.defaclrole='postgres'::regrole
      and defaults.defaclobjtype in ('r','S','f')
      and (acl.grantee=0 or grantee_role.rolname in ('anon','authenticated'))
  `);
  for (const privilege of defaultClientPrivileges.rows) {
    failures.push(`default_privilege:${privilege.owner}:${privilege.object_type}:${privilege.grantee}:${privilege.privilege_type}`);
  }

  const protectedFunctions = ["maestro_scope_legacy_record", "maestro_sync_relational_job_history", "maestro_sync_relational_webhook_receipt", "maestro_apply_legacy_mutation_scoped", "resolve_job_task_reconciliation", "create_organization_tenant"];
  const permissions = await client.query(`select p.proname, p.prosecdef as security_definer,
      p.proconfig as function_config,
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any($1::text[])`, [protectedFunctions]);
  for (const row of permissions.rows) {
    if (row.anon_execute || row.authenticated_execute) failures.push(`${row.proname}: public_execute_enabled`);
    if (row.proname === "resolve_job_task_reconciliation") {
      if (row.security_definer) failures.push(`${row.proname}: security_definer_enabled`);
      if (!row.service_role_execute) failures.push(`${row.proname}: service_role_execute_missing`);
      if (!row.function_config?.includes("search_path=\"\"")) failures.push(`${row.proname}: search_path_not_empty`);
    }
  }

  console.log(JSON.stringify({ status: failures.length ? "failed" : "ok", reference_contracts_checked: referenceColumns.rows.length, reference_foreign_keys: referenceFks.rows, tables: tableResult.rows, scope: scopeRow, legacy_access: { ...legacyAccess.rows[0], select_policies: legacySelectPolicy.rows, indirect_paths: legacyIndirectAccess.rows }, server_managed_tables: serverManagedCheck.rows, organization_members_access: membership, tenant_foreign_keys: tenantForeignKeys.rows, tenant_fk_coverage: tenantFkCoverage.rows, server_managed_table_privileges: unmanagedTablePrivileges.rows, public_client_privileges: publicClientPrivileges.rows, default_client_privileges: defaultClientPrivileges.rows, deployed_webhook_relations: webhookSchema.rows, deployed_webhook_functions: webhookFunctions.rows, permissions: permissions.rows, failures }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
