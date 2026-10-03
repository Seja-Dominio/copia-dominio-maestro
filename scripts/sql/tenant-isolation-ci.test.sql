-- Synthetic, transaction-only tenant/RLS contracts for the clean-room CI DB.
-- All fixtures and temporary grants are reverted by the final ROLLBACK.
begin;

do $preflight$
begin
  if exists (
    select 1 from public.organizations
    where id in (
      '00000000-0000-0000-0000-00000000a001'::uuid,
      '00000000-0000-0000-0000-00000000b001'::uuid
    )
  ) or exists (
    select 1 from public.maestro_collaborators
    where id in (
      '00000000-0000-0000-0000-00000000a101',
      '00000000-0000-0000-0000-00000000b101'
    )
  ) or exists (
    select 1 from public.maestro_jobs
    where id in (
      '00000000-0000-0000-0000-00000000a401'::uuid,
      '00000000-0000-0000-0000-00000000b401'::uuid
    )
  ) or exists (
    select 1 from public.maestro_projects
    where id in ('00000000-0000-0000-0000-00000000b301'::uuid,
      '00000000-0000-0000-0000-00000000a302'::uuid)
  ) or exists (
    select 1 from public.maestro_jobs
    where organization_id = '00000000-0000-0000-0000-00000000a001'::uuid
      and legacy_record_id in ('tenant-ci-cross-job', 'tenant-ci-cross-client-job', 'tenant-ci-valid-job')
  ) or exists (
    select 1 from public.maestro_projects
    where organization_id = '00000000-0000-0000-0000-00000000a001'::uuid
      and legacy_record_id in ('tenant-ci-cross-project-write', 'tenant-ci-relational-project')
  ) or exists (
    select 1 from public.maestro_job_tasks
    where organization_id = '00000000-0000-0000-0000-00000000a001'::uuid
      and legacy_record_id in ('tenant-ci-cross-task', 'tenant-ci-valid-task',
        'tenant-ci-reconciliation-already-linked')
  ) or exists (
    select 1 from public.legacy_records
    where record_id in ('tenant-ci-cross-project-client', 'tenant-ci-cross-job-client',
      'tenant-ci-cross-job-project', 'tenant-ci-unresolved-project',
      'tenant-ci-cross-project-write', 'tenant-ci-relational-project',
      'tenant-ci-legacy-projection-task', 'tenant-ci-cross-tenant-projection-task',
      'tenant-ci-legacy-projection-entry', 'tenant-ci-cross-tenant-projection-entry',
      'tenant-ci-legacy-projection-history', 'tenant-ci-cross-tenant-projection-history',
      'tenant-ci-missing-job-projection-history', 'tenant-ci-nps-entry-a',
      'tenant-ci-nps-history-a', 'tenant-ci-nps-history-unresolved',
      'tenant-ci-nps-cross-scope', 'tenant-ci-nps-ambiguous-map',
      'tenant-ci-nps-projection-move')
  ) or exists (
    select 1 from public.organization_legacy_records
    where legacy_entity = 'Project'
      and legacy_record_id in ('tenant-ci-cross-project-write', 'tenant-ci-relational-project')
  ) or exists (
    select 1 from public.organization_legacy_records
      where legacy_record_id in ('tenant-ci-legacy-projection-task', 'tenant-ci-cross-tenant-projection-task',
        'tenant-ci-legacy-projection-entry', 'tenant-ci-cross-tenant-projection-entry',
        'tenant-ci-legacy-projection-history', 'tenant-ci-cross-tenant-projection-history',
        'tenant-ci-missing-job-projection-history', 'tenant-ci-nps-entry-a',
        'tenant-ci-nps-history-a', 'tenant-ci-nps-history-unresolved',
        'tenant-ci-nps-cross-scope', 'tenant-ci-nps-ambiguous-map',
        'tenant-ci-nps-projection-move')
  ) or exists (
    select 1 from public.maestro_bank_accounts
    where legacy_record_id in ('tenant-ci-account-a', 'tenant-ci-account-b')
  ) or exists (
    select 1 from public.maestro_job_tasks
      where organization_id = '00000000-0000-0000-0000-00000000a001'::uuid
        and legacy_record_id in ('tenant-ci-task-a', 'tenant-ci-legacy-projection-task',
          'tenant-ci-cross-tenant-projection-task')
  ) or exists (
    select 1 from public.maestro_financial_entries
      where legacy_record_id in ('tenant-ci-legacy-projection-entry', 'tenant-ci-cross-tenant-projection-entry')
  ) or exists (
    select 1 from public.maestro_job_history
      where legacy_record_id in ('tenant-ci-legacy-projection-history',
        'tenant-ci-cross-tenant-projection-history', 'tenant-ci-missing-job-projection-history')
  ) or exists (
    select 1 from public.maestro_nps_entries
      where legacy_record_id = 'tenant-ci-nps-entry-a'
  ) or exists (
    select 1 from public.maestro_nps_history
    where legacy_record_id in ('tenant-ci-nps-history-a', 'tenant-ci-nps-history-unresolved',
        'tenant-ci-nps-cross-scope', 'tenant-ci-nps-ambiguous-map',
        'tenant-ci-nps-projection-move')
  ) or exists (
    select 1 from public.job_task_reconciliation
    where id = '00000000-0000-0000-0000-00000000a501'::uuid
      or id in ('00000000-0000-0000-0000-00000000a502'::uuid,
        '00000000-0000-0000-0000-00000000a503'::uuid)
      or (legacy_entity = 'Subtask' and legacy_record_id in ('tenant-ci-reconciliation-task',
        'tenant-ci-queue-without-task', 'tenant-ci-reconciliation-already-linked'))
  ) or exists (
    select 1 from public.maestro_timesheets
      where legacy_record_id in ('tenant-ci-timesheet-delete-a', 'tenant-ci-timesheet-delete-b',
        'tenant-ci-timesheet-running-a', 'tenant-ci-timesheet-running-b')
  ) then
    raise exception 'Tenant CI fixture IDs already exist; refusing to run.';
  end if;
end;
$preflight$;

do $reconciliation_privilege_contract$
begin
  if has_table_privilege('service_role', 'public.job_task_reconciliation', 'SELECT')
    or has_table_privilege('service_role', 'public.job_task_reconciliation', 'INSERT')
    or has_table_privilege('service_role', 'public.job_task_reconciliation', 'UPDATE')
    or has_table_privilege('service_role', 'public.job_task_reconciliation', 'DELETE') then
    raise exception 'service_role must not have table-wide access to reconciliation queue';
  end if;
  if not has_column_privilege('service_role', 'public.job_task_reconciliation', 'id', 'SELECT')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'organization_id', 'SELECT')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'legacy_record_id', 'SELECT')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'resolution_status', 'SELECT')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'resolution_status', 'UPDATE')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'resolved_job_id', 'UPDATE')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'resolution_note', 'UPDATE')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'resolved_at', 'UPDATE')
    or not has_column_privilege('service_role', 'public.job_task_reconciliation', 'resolved_by', 'UPDATE') then
    raise exception 'service_role is missing a required reconciliation column privilege';
  end if;
  if has_column_privilege('service_role', 'public.job_task_reconciliation', 'payload', 'SELECT')
    or has_column_privilege('service_role', 'public.job_task_reconciliation', 'id', 'UPDATE') then
    raise exception 'service_role has an unapproved reconciliation column privilege';
  end if;
end;
$reconciliation_privilege_contract$;

insert into public.maestro_collaborators (id, login, password_hash, is_active, profile)
values
  ('00000000-0000-0000-0000-00000000a101', 'tenant-ci-a@invalid.test', 'fixture', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000b101', 'tenant-ci-b@invalid.test', 'fixture', true, '{}'::jsonb);

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-0000-0000-00000000a001', 'Tenant CI A', 'tenant-ci-a'),
  ('00000000-0000-0000-0000-00000000b001', 'Tenant CI B', 'tenant-ci-b');

insert into public.organization_members (organization_id, collaborator_id, role, status)
values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a101', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b101', 'owner', 'active');

insert into public.legacy_cutover_registry (
  entity, module_key, relational_table, read_mode, write_mode,
  legacy_read_allowed, legacy_write_allowed, status, evidence
) values (
  'Project', 'maestro', 'maestro_projects', 'relational', 'relational',
  true, false, 'frozen', 'Tenant isolation test fixture for the canonical Project writer.'
) on conflict (entity) do nothing;

insert into public.maestro_clients (id, organization_id, legacy_record_id, name)
values
  ('00000000-0000-0000-0000-00000000a201', '00000000-0000-0000-0000-00000000a001', 'tenant-ci-client-a', 'Tenant CI Client A'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000b001', 'tenant-ci-client-b', 'Tenant CI Client B');

insert into public.maestro_projects (id, organization_id, legacy_record_id, client_id, client_legacy_record_id, name)
values
  ('00000000-0000-0000-0000-00000000a301', '00000000-0000-0000-0000-00000000a001', 'tenant-ci-project-a', '00000000-0000-0000-0000-00000000a201', 'tenant-ci-client-a', 'Tenant CI Project A'),
  ('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000b001', 'tenant-ci-project-b', '00000000-0000-0000-0000-00000000b201', 'tenant-ci-client-b', 'Tenant CI Project B');

insert into public.maestro_jobs (
  id, organization_id, legacy_record_id, project_id, project_legacy_record_id,
  client_id, client_legacy_record_id, title
)
values
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000a001', 'tenant-ci-job-a',
    '00000000-0000-0000-0000-00000000a301', 'tenant-ci-project-a',
    '00000000-0000-0000-0000-00000000a201', 'tenant-ci-client-a', 'Tenant CI Job A'),
  ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000b001', 'tenant-ci-job-b',
    null, null, '00000000-0000-0000-0000-00000000b201', 'tenant-ci-client-b', 'Tenant CI Job B');

insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id, title,
  responsible_id, responsible_name, resolution_status
)
values
  ('00000000-0000-0000-0000-00000000a001', 'tenant-ci-task-a', 'tenant-ci-job-a',
    '00000000-0000-0000-0000-00000000a401', 'Tenant CI Task A',
    '00000000-0000-0000-0000-00000000a101', 'Tenant CI User A', 'linked'),
  ('00000000-0000-0000-0000-00000000a001', 'tenant-ci-reconciliation-task', 'legacy-pending-job',
    null, 'Tenant CI Reconciliation Task', '00000000-0000-0000-0000-00000000a101', 'Tenant CI User A', 'pending'),
  ('00000000-0000-0000-0000-00000000a001', 'tenant-ci-reconciliation-already-linked', 'tenant-ci-job-a',
    '00000000-0000-0000-0000-00000000a401', 'Already linked task',
    '00000000-0000-0000-0000-00000000a101', 'Tenant CI User A', 'linked');

insert into public.job_task_reconciliation (
  id, legacy_entity, legacy_record_id, legacy_job_id, payload,
  source_status, resolution_status, organization_id
) values (
  '00000000-0000-0000-0000-00000000a501', 'Subtask', 'tenant-ci-reconciliation-task',
  'legacy-pending-job', '{}'::jsonb, 'pending', 'pending', '00000000-0000-0000-0000-00000000a001'
), (
  '00000000-0000-0000-0000-00000000a502', 'Subtask', 'tenant-ci-queue-without-task',
  'legacy-missing-parent', '{}'::jsonb, 'pending', 'pending', '00000000-0000-0000-0000-00000000a001'
), (
  '00000000-0000-0000-0000-00000000a503', 'Subtask', 'tenant-ci-reconciliation-already-linked',
  'tenant-ci-job-a', '{}'::jsonb, 'pending', 'pending', '00000000-0000-0000-0000-00000000a001'
);

insert into public.maestro_bank_accounts (legacy_record_id, organization_id, name)
values
  ('tenant-ci-account-a', '00000000-0000-0000-0000-00000000a001', 'Tenant CI Account A'),
  ('tenant-ci-account-b', '00000000-0000-0000-0000-00000000b001', 'Tenant CI Account B');

-- The product's authenticated frontend currently uses Edge Functions. Granting
-- SELECT only inside this transaction lets this test exercise the RLS policy
-- itself without persisting a broader client grant.
grant select on public.maestro_clients to authenticated;
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a101","role":"authenticated"}', true);
do $tenant_a$
declare
  membership_count integer;
  client_count integer;
begin
  select count(*) into membership_count from public.organization_members;
  select count(*) into client_count from public.maestro_clients;
  if membership_count <> 1 or client_count <> 1 then
    raise exception 'Tenant A isolation failed: memberships %, clients %.', membership_count, client_count;
  end if;
  if exists (select 1 from public.maestro_clients where organization_id <> '00000000-0000-0000-0000-00000000a001'::uuid) then
    raise exception 'Tenant A can see another tenant client.';
  end if;
end;
$tenant_a$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b101","role":"authenticated"}', true);
do $tenant_b$
declare
  membership_count integer;
  client_count integer;
begin
  select count(*) into membership_count from public.organization_members;
  select count(*) into client_count from public.maestro_clients;
  if membership_count <> 1 or client_count <> 1 then
    raise exception 'Tenant B isolation failed: memberships %, clients %.', membership_count, client_count;
  end if;
  if exists (select 1 from public.maestro_clients where organization_id <> '00000000-0000-0000-0000-00000000b001'::uuid) then
    raise exception 'Tenant B can see another tenant client.';
  end if;
end;
$tenant_b$;

reset role;

-- Exercise the service_role path that bypasses RLS: tenant safety must come
-- from the SECURITY INVOKER RPC's explicit organization-scoped lookups.
set local role service_role;
do $service_role_core_writes$
declare
  v_project_result jsonb;
  v_job_result jsonb;
  v_task_result jsonb;
  v_reconciliation_result jsonb;
  v_job_id uuid;
  v_error text;
begin
  begin
    perform public.maestro_upsert_project_scoped(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      'create', 'tenant-ci-cross-project-write',
      '{"name":"Cross-tenant client","client_id":"tenant-ci-client-b"}'::jsonb
    );
    raise exception 'TEST_FAIL cross-tenant client accepted by relational Project writer';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'project client must belong to the same organization'
      and v_error <> 'TEST_FAIL cross-tenant client accepted by relational Project writer' then
      raise exception 'TEST_FAIL unexpected relational Project rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL cross-tenant client accepted by relational Project writer' then raise; end if;
  end;

  v_project_result := public.maestro_upsert_project_scoped(
    '00000000-0000-0000-0000-00000000a001'::uuid,
    'create', 'tenant-ci-relational-project',
    '{"name":"Relational project","client_id":"tenant-ci-client-a"}'::jsonb
  );
  if v_project_result ->> 'name' <> 'Relational project'
    or not exists (select 1 from public.maestro_projects p
      where p.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
        and p.legacy_record_id='tenant-ci-relational-project'
        and p.client_id='00000000-0000-0000-0000-00000000a201'::uuid)
    or exists (select 1 from public.legacy_records l
      where l.entity='Project' and l.record_id='tenant-ci-relational-project') then
    raise exception 'TEST_FAIL canonical Project create must persist relationally without recreating legacy row';
  end if;

  v_project_result := public.maestro_upsert_project_scoped(
    '00000000-0000-0000-0000-00000000a001'::uuid,
    'update', 'tenant-ci-project-a',
    '{"schedule_patch":{"2026-10-02":[{"title":"Fixture"}]}}'::jsonb
  );
  if v_project_result #>> '{schedule_data,2026-10-02,0,title}' <> 'Fixture'
    or v_project_result ? 'schedule_patch'
    or exists (select 1 from public.legacy_records l
      where l.entity='Project' and l.record_id='tenant-ci-project-a') then
    raise exception 'TEST_FAIL canonical Project update must merge schedule and avoid legacy writes';
  end if;

  begin
    perform public.maestro_write_frozen_core_with_history(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      'Job', 'create', 'tenant-ci-cross-job',
      '{"title":"Cross-tenant project","project_id":"tenant-ci-project-b","client_id":"tenant-ci-client-a"}'::jsonb,
      '00000000-0000-0000-0000-00000000a101', 'Tenant CI A'
    );
    raise exception 'TEST_FAIL cross-tenant project accepted by service_role RPC';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'job project must belong to the same organization'
      and v_error <> 'TEST_FAIL cross-tenant project accepted by service_role RPC' then
      raise exception 'TEST_FAIL unexpected cross-tenant project rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL cross-tenant project accepted by service_role RPC' then raise; end if;
  end;
  if exists (select 1 from public.maestro_jobs where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and legacy_record_id='tenant-ci-cross-job') then
    raise exception 'TEST_FAIL rejected service_role write left a Job behind';
  end if;

  begin
    perform public.maestro_write_frozen_core_with_history(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      'Job', 'create', 'tenant-ci-cross-client-job',
      '{"title":"Cross-tenant client","project_id":"tenant-ci-project-a","client_id":"tenant-ci-client-b"}'::jsonb,
      '00000000-0000-0000-0000-00000000a101', 'Tenant CI A'
    );
    raise exception 'TEST_FAIL cross-tenant client accepted by service_role RPC';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'job client must belong to the same organization'
      and v_error <> 'TEST_FAIL cross-tenant client accepted by service_role RPC' then
      raise exception 'TEST_FAIL unexpected cross-tenant client rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL cross-tenant client accepted by service_role RPC' then raise; end if;
  end;
  if exists (select 1 from public.maestro_jobs where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and legacy_record_id='tenant-ci-cross-client-job') then
    raise exception 'TEST_FAIL rejected service_role write left a Job behind';
  end if;

  begin
    perform public.maestro_write_frozen_core_with_history(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      'Subtask', 'create', 'tenant-ci-cross-task',
      '{"title":"Cross-tenant job","job_id":"tenant-ci-job-b"}'::jsonb,
      '00000000-0000-0000-0000-00000000a101', 'Tenant CI A'
    );
    raise exception 'TEST_FAIL cross-tenant job accepted by service_role RPC';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'subtask job must belong to the same organization'
      and v_error <> 'TEST_FAIL cross-tenant job accepted by service_role RPC' then
      raise exception 'TEST_FAIL unexpected cross-tenant job rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL cross-tenant job accepted by service_role RPC' then raise; end if;
  end;
  if exists (select 1 from public.maestro_job_tasks where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and legacy_record_id='tenant-ci-cross-task') then
    raise exception 'TEST_FAIL rejected service_role write left a Subtask behind';
  end if;

  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'Project', 'tenant-ci-cross-project-client',
      '{"name":"Cross-tenant Project client","client_id":"tenant-ci-client-b"}'::jsonb);
    raise exception 'TEST_FAIL cross-tenant Project client accepted by legacy projection';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Project client must belong to the same organization'
      and v_error <> 'TEST_FAIL cross-tenant Project client accepted by legacy projection' then
      raise exception 'TEST_FAIL unexpected Project client rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL cross-tenant Project client accepted by legacy projection' then raise; end if;
  end;

  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'Job', 'tenant-ci-cross-job-client',
      '{"title":"Cross-tenant Job client","client_id":"tenant-ci-client-b"}'::jsonb);
    raise exception 'TEST_FAIL cross-tenant Job client accepted by legacy projection';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Job client must belong to the same organization'
      and v_error <> 'TEST_FAIL cross-tenant Job client accepted by legacy projection' then
      raise exception 'TEST_FAIL unexpected Job client rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL cross-tenant Job client accepted by legacy projection' then raise; end if;
  end;

  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'Job', 'tenant-ci-cross-job-project',
      '{"title":"Cross-tenant Job project","project_id":"tenant-ci-project-b"}'::jsonb);
    raise exception 'TEST_FAIL cross-tenant Job project accepted by legacy projection';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Job project must belong to the same organization'
      and v_error <> 'TEST_FAIL cross-tenant Job project accepted by legacy projection' then
      raise exception 'TEST_FAIL unexpected Job project rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL cross-tenant Job project accepted by legacy projection' then raise; end if;
  end;

  -- Keep compatibility with genuinely unresolved historical pointers; only
  -- IDs that resolve to another organization are forbidden.
  insert into public.legacy_records (organization_id, entity, record_id, payload)
  values ('00000000-0000-0000-0000-00000000a001'::uuid, 'Project', 'tenant-ci-unresolved-project',
    '{"name":"Unresolved legacy Project client","client_id":"tenant-ci-unknown-client"}'::jsonb);

  v_job_result := public.maestro_write_frozen_core_with_history(
    '00000000-0000-0000-0000-00000000a001'::uuid,
    'Job', 'create', 'tenant-ci-valid-job',
    '{"title":"Valid scoped Job","project_id":"tenant-ci-project-a","client_id":"tenant-ci-client-a"}'::jsonb,
    '00000000-0000-0000-0000-00000000a101', 'Tenant CI A'
  );
  select id into v_job_id from public.maestro_jobs
  where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and legacy_record_id='tenant-ci-valid-job';
  if v_job_id is null or v_job_result ->> 'title' <> 'Valid scoped Job' then
    raise exception 'TEST_FAIL valid service_role Job write did not persist';
  end if;
  v_task_result := public.maestro_write_frozen_core_with_history(
    '00000000-0000-0000-0000-00000000a001'::uuid,
    'Subtask', 'create', 'tenant-ci-valid-task',
    '{"title":"Valid scoped task","job_id":"tenant-ci-valid-job"}'::jsonb,
    '00000000-0000-0000-0000-00000000a101', 'Tenant CI A'
  );
  if v_task_result ->> 'job_id' <> 'tenant-ci-valid-job'
    or not exists (select 1 from public.maestro_job_tasks where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and legacy_record_id='tenant-ci-valid-task' and job_id=v_job_id)
  then raise exception 'TEST_FAIL valid service_role Subtask write did not preserve tenant-scoped Job relation'; end if;

  insert into public.legacy_records (organization_id, entity, record_id, payload)
  values ('00000000-0000-0000-0000-00000000a001'::uuid, 'Subtask', 'tenant-ci-legacy-projection-task',
    '{"title":"Legacy dual-write task","job_id":"tenant-ci-job-a"}'::jsonb);
  if not exists (
    select 1 from public.maestro_job_tasks t
    join public.maestro_jobs j on j.id=t.job_id and j.organization_id=t.organization_id
    where t.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and t.legacy_record_id='tenant-ci-legacy-projection-task'
      and j.legacy_record_id='tenant-ci-job-a'
  ) then raise exception 'TEST_FAIL legacy Subtask dual-write did not preserve same-tenant Job'; end if;

  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'Subtask', 'tenant-ci-cross-tenant-projection-task',
      '{"title":"Cross-tenant legacy dual-write task","job_id":"tenant-ci-job-b"}'::jsonb);
    raise exception 'TEST_FAIL legacy Subtask dual-write accepted another tenant Job';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Subtask job must belong to the same organization'
      and v_error <> 'TEST_FAIL legacy Subtask dual-write accepted another tenant Job' then
      raise exception 'TEST_FAIL unexpected legacy Subtask projection rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL legacy Subtask dual-write accepted another tenant Job' then raise; end if;
  end;

  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'Subtask', 'tenant-ci-missing-parent-projection-task',
      '{"title":"Missing parent projection task","job_id":"tenant-ci-missing-job"}'::jsonb);
    raise exception 'TEST_FAIL legacy Subtask dual-write accepted a missing Job';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Subtask job must belong to the same organization'
      and v_error <> 'TEST_FAIL legacy Subtask dual-write accepted a missing Job' then
      raise exception 'TEST_FAIL unexpected missing-parent Subtask projection rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL legacy Subtask dual-write accepted a missing Job' then raise; end if;
  end;

  insert into public.legacy_records (organization_id, entity, record_id, payload)
  values ('00000000-0000-0000-0000-00000000a001'::uuid, 'FinancialEntry', 'tenant-ci-legacy-projection-entry',
    '{"title":"Legacy dual-write entry","type":"income","amount":"123.45","client_id":"tenant-ci-client-a","bank_account_id":"tenant-ci-account-a"}'::jsonb);
  if not exists (
    select 1 from public.maestro_financial_entries e
    join public.maestro_bank_accounts a
      on a.organization_id=e.organization_id and a.legacy_record_id=e.bank_account_legacy_record_id
    where e.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and e.legacy_record_id='tenant-ci-legacy-projection-entry'
      and e.amount=123.45 and a.legacy_record_id='tenant-ci-account-a'
  ) then raise exception 'TEST_FAIL legacy FinancialEntry dual-write did not preserve tenant/account'; end if;

  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'FinancialEntry', 'tenant-ci-cross-tenant-projection-entry',
      '{"title":"Cross-tenant legacy dual-write entry","type":"income","amount":"12.00","client_id":"tenant-ci-client-a","bank_account_id":"tenant-ci-account-b"}'::jsonb);
    raise exception 'TEST_FAIL legacy FinancialEntry dual-write accepted another tenant account';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Financial entry bank account must belong to the same organization'
      and v_error <> 'TEST_FAIL legacy FinancialEntry dual-write accepted another tenant account' then
      raise exception 'TEST_FAIL unexpected legacy FinancialEntry projection rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL legacy FinancialEntry dual-write accepted another tenant account' then raise; end if;
  end;

  insert into public.legacy_records (organization_id, entity, record_id, payload)
  values ('00000000-0000-0000-0000-00000000a001'::uuid, 'JobHistory', 'tenant-ci-legacy-projection-history',
    '{"job_id":"tenant-ci-job-a","type":"status_changed","field":"status","old_value":"open","new_value":"done","text":"Fixture history"}'::jsonb);
  if not exists (
    select 1 from public.maestro_job_history h
    join public.maestro_jobs j on j.id=h.job_id and j.organization_id=h.organization_id
    where h.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and h.legacy_record_id='tenant-ci-legacy-projection-history'
      and j.legacy_record_id='tenant-ci-job-a'
  ) then raise exception 'TEST_FAIL legacy JobHistory dual-write did not preserve same-tenant Job'; end if;

  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'JobHistory', 'tenant-ci-cross-tenant-projection-history',
      '{"job_id":"tenant-ci-job-b","type":"status_changed","field":"status","text":"Must reject cross-tenant parent"}'::jsonb);
    raise exception 'TEST_FAIL legacy JobHistory dual-write accepted another tenant Job';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Job history job must belong to the same organization'
      and v_error <> 'TEST_FAIL legacy JobHistory dual-write accepted another tenant Job' then
      raise exception 'TEST_FAIL unexpected cross-tenant JobHistory projection rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL legacy JobHistory dual-write accepted another tenant Job' then raise; end if;
  end;

  insert into public.legacy_records (organization_id, entity, record_id, payload)
  values ('00000000-0000-0000-0000-00000000a001'::uuid, 'JobHistory', 'tenant-ci-missing-job-projection-history',
    '{"job_id":"tenant-ci-missing-job","type":"status_changed","field":"status","text":"Preserve orphan history snapshot"}'::jsonb);
  if not exists (
    select 1 from public.maestro_job_history h
    where h.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and h.legacy_record_id='tenant-ci-missing-job-projection-history'
      and h.job_legacy_id='tenant-ci-missing-job' and h.job_id is null
  ) then raise exception 'TEST_FAIL legacy JobHistory did not preserve an unresolved Job as a tenant-scoped snapshot'; end if;

  -- NPS has its own dual-write path (Insights ownership). It must use an
  -- explicit or uniquely mapped tenant, never choose the first active org.
  insert into public.legacy_records (organization_id, entity, record_id, payload)
  values ('00000000-0000-0000-0000-00000000a001'::uuid, 'NpsEntry', 'tenant-ci-nps-entry-a',
    '{"client_id":"tenant-ci-client-a","month":"2026-10-01","monthly_score":9,"notes":"tenant A"}'::jsonb);
  insert into public.legacy_records (organization_id, entity, record_id, payload)
  values ('00000000-0000-0000-0000-00000000a001'::uuid, 'NpsHistory', 'tenant-ci-nps-history-a',
    '{"client_id":"tenant-ci-client-a","event_type":"score_changed","delta":1,"score_before":8,"score_after":9}'::jsonb);
  update public.legacy_records
  set payload = payload || '{"monthly_score":10}'::jsonb
  where entity='NpsEntry' and record_id='tenant-ci-nps-entry-a';
  if not exists (
    select 1 from public.organization_legacy_records m
    where m.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and m.legacy_entity='NpsEntry' and m.legacy_record_id='tenant-ci-nps-entry-a'
      and m.scope_status='confirmed' and m.source='scoped-nps-dual-write'
  ) or not exists (
    select 1 from public.maestro_nps_entries e
    where e.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and e.legacy_record_id='tenant-ci-nps-entry-a' and e.month='2026-10-01'::date
      and e.monthly_score=10
  ) or not exists (
    select 1 from public.maestro_nps_history h
    where h.organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and h.legacy_record_id='tenant-ci-nps-history-a' and h.score_after=9
  ) then
    raise exception 'TEST_FAIL scoped NPS entry/history did not map and project for its explicit tenant';
  end if;

  begin
    insert into public.legacy_records (entity, record_id, payload)
    values ('NpsHistory', 'tenant-ci-nps-history-unresolved', '{"event_type":"unscoped"}'::jsonb);
    raise exception 'TEST_FAIL unscoped NPS history was assigned to an arbitrary tenant';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'NPS record requires an explicit organization in a multi-tenant system'
      and v_error <> 'TEST_FAIL unscoped NPS history was assigned to an arbitrary tenant' then
      raise exception 'TEST_FAIL unexpected unresolved NPS tenant result: %', v_error;
    end if;
    if v_error = 'TEST_FAIL unscoped NPS history was assigned to an arbitrary tenant' then raise; end if;
  end;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    '00000000-0000-0000-0000-00000000b001'::uuid,
    'NpsHistory', 'tenant-ci-nps-cross-scope', 'confirmed', 'tenant-ci-fixture'
  );
  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'NpsHistory', 'tenant-ci-nps-cross-scope',
      '{"event_type":"must reject mapping mismatch"}'::jsonb);
    raise exception 'TEST_FAIL NPS dual-write accepted a mapping from another tenant';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'NPS record organization scope mismatch'
      and v_error <> 'TEST_FAIL NPS dual-write accepted a mapping from another tenant' then
      raise exception 'TEST_FAIL unexpected cross-tenant NPS rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL NPS dual-write accepted a mapping from another tenant' then raise; end if;
  end;
  if exists (
    select 1 from public.legacy_records where record_id='tenant-ci-nps-history-unresolved'
  ) or exists (
    select 1 from public.maestro_nps_history
    where legacy_record_id in ('tenant-ci-nps-history-unresolved', 'tenant-ci-nps-cross-scope')
  ) then
    raise exception 'TEST_FAIL rejected NPS write left a source row or projection';
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values
    ('00000000-0000-0000-0000-00000000a001'::uuid, 'NpsHistory', 'tenant-ci-nps-ambiguous-map', 'confirmed', 'tenant-ci-fixture'),
    ('00000000-0000-0000-0000-00000000b001'::uuid, 'NpsHistory', 'tenant-ci-nps-ambiguous-map', 'confirmed', 'tenant-ci-fixture');
  begin
    insert into public.legacy_records (entity, record_id, payload)
    values ('NpsHistory', 'tenant-ci-nps-ambiguous-map', '{"event_type":"ambiguous"}'::jsonb);
    raise exception 'TEST_FAIL NPS dual-write accepted ambiguous tenant mappings';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'NPS record organization mapping is ambiguous'
      and v_error <> 'TEST_FAIL NPS dual-write accepted ambiguous tenant mappings' then
      raise exception 'TEST_FAIL unexpected ambiguous NPS mapping rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL NPS dual-write accepted ambiguous tenant mappings' then raise; end if;
  end;
  if exists (
    select 1 from public.legacy_records where record_id='tenant-ci-nps-ambiguous-map'
  ) or exists (
    select 1 from public.maestro_nps_history where legacy_record_id='tenant-ci-nps-ambiguous-map'
  ) then
    raise exception 'TEST_FAIL ambiguous NPS rejection left a source row or projection';
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    '00000000-0000-0000-0000-00000000a001'::uuid,
    'NpsHistory', 'tenant-ci-nps-projection-move', 'confirmed', 'tenant-ci-fixture'
  );
  insert into public.maestro_nps_history (
    legacy_record_id, organization_id, event_type, payload
  ) values (
    'tenant-ci-nps-projection-move', '00000000-0000-0000-0000-00000000b001'::uuid,
    'existing-tenant-b', '{"event_type":"existing-tenant-b"}'::jsonb
  );
  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values ('00000000-0000-0000-0000-00000000a001'::uuid, 'NpsHistory', 'tenant-ci-nps-projection-move',
      '{"event_type":"must not move projection"}'::jsonb);
    raise exception 'TEST_FAIL NPS dual-write moved a projection between tenants';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'NPS history cannot move between organizations'
      and v_error <> 'TEST_FAIL NPS dual-write moved a projection between tenants' then
      raise exception 'TEST_FAIL unexpected NPS projection-move rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL NPS dual-write moved a projection between tenants' then raise; end if;
  end;
  if exists (
    select 1 from public.legacy_records where record_id='tenant-ci-nps-projection-move'
  ) or not exists (
    select 1 from public.maestro_nps_history
    where legacy_record_id='tenant-ci-nps-projection-move'
      and organization_id='00000000-0000-0000-0000-00000000b001'::uuid
      and event_type='existing-tenant-b'
  ) then
    raise exception 'TEST_FAIL rejected NPS projection move changed source or existing projection';
  end if;

  begin
    perform public.resolve_job_task_reconciliation(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      '00000000-0000-0000-0000-00000000a501'::uuid,
      '00000000-0000-0000-0000-00000000b401'::uuid,
      'tenant-ci-a', 'cross-tenant rejection'
    );
    raise exception 'TEST_FAIL reconciliation accepted another tenant Job';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'target job does not belong to organization'
      and v_error <> 'TEST_FAIL reconciliation accepted another tenant Job' then
      raise exception 'TEST_FAIL unexpected reconciliation tenant rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL reconciliation accepted another tenant Job' then raise; end if;
  end;

  v_reconciliation_result := public.resolve_job_task_reconciliation(
    '00000000-0000-0000-0000-00000000a001'::uuid,
    '00000000-0000-0000-0000-00000000a501'::uuid,
    '00000000-0000-0000-0000-00000000a401'::uuid,
    'tenant-ci-a', 'validated fixture resolution'
  );
  if v_reconciliation_result ->> 'status' <> 'linked'
    or v_reconciliation_result ->> 'task_legacy_record_id' <> 'tenant-ci-reconciliation-task' then
    raise exception 'TEST_FAIL reconciliation resolver returned unexpected result';
  end if;
  begin
    perform public.resolve_job_task_reconciliation(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      '00000000-0000-0000-0000-00000000a501'::uuid,
      '00000000-0000-0000-0000-00000000a401'::uuid,
      'tenant-ci-a', 'repeat resolution'
    );
    raise exception 'TEST_FAIL reconciliation was resolved more than once';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'reconciliation item is already resolved'
      and v_error <> 'TEST_FAIL reconciliation was resolved more than once' then
      raise exception 'TEST_FAIL unexpected duplicate reconciliation rejection: %', v_error;
    end if;
    if v_error = 'TEST_FAIL reconciliation was resolved more than once' then raise; end if;
  end;

  begin
    perform public.resolve_job_task_reconciliation(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      '00000000-0000-0000-0000-00000000a502'::uuid,
      '00000000-0000-0000-0000-00000000a401'::uuid,
      'tenant-ci-a', 'queue without relational task'
    );
    raise exception 'TEST_FAIL reconciliation accepted a queue row without exactly one pending task';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'expected exactly one pending relational task, updated 0'
      and v_error <> 'TEST_FAIL reconciliation accepted a queue row without exactly one pending task' then
      raise exception 'TEST_FAIL unexpected missing-task reconciliation result: %', v_error;
    end if;
    if v_error = 'TEST_FAIL reconciliation accepted a queue row without exactly one pending task' then raise; end if;
  end;

  begin
    perform public.resolve_job_task_reconciliation(
      '00000000-0000-0000-0000-00000000a001'::uuid,
      '00000000-0000-0000-0000-00000000a503'::uuid,
      '00000000-0000-0000-0000-00000000a401'::uuid,
      'tenant-ci-a', 'do not overwrite an already-linked task'
    );
    raise exception 'TEST_FAIL reconciliation overwrote a task that was already linked';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'expected exactly one pending relational task, updated 0'
      and v_error <> 'TEST_FAIL reconciliation overwrote a task that was already linked' then
      raise exception 'TEST_FAIL unexpected already-linked reconciliation result: %', v_error;
    end if;
    if v_error = 'TEST_FAIL reconciliation overwrote a task that was already linked' then raise; end if;
  end;

end;
$service_role_core_writes$;
reset role;
do $verify_service_role_core_writes$
declare
  v_job_id uuid;
  v_history_count integer;
begin
  select id into v_job_id from public.maestro_jobs
  where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and legacy_record_id='tenant-ci-valid-job';
  if v_job_id is null then raise exception 'TEST_FAIL valid service_role Job write did not persist'; end if;
  select count(*) into v_history_count from public.maestro_job_history
  where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and job_legacy_id='tenant-ci-valid-job';
  if v_history_count <> 2 then raise exception 'TEST_FAIL Job/Subtask writes and history were not committed atomically'; end if;
  if not exists (select 1 from public.maestro_job_history where organization_id='00000000-0000-0000-0000-00000000a001'::uuid and job_id=v_job_id) then
    raise exception 'TEST_FAIL Job history did not resolve its typed tenant-scoped Job relation';
  end if;
  if not exists (
    select 1 from public.maestro_job_tasks
    where organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and legacy_record_id='tenant-ci-valid-task' and job_id=v_job_id
  ) then raise exception 'TEST_FAIL valid service_role Subtask write did not preserve tenant-scoped Job relation'; end if;
  if not exists (
    select 1 from public.job_task_reconciliation
    where id='00000000-0000-0000-0000-00000000a501'::uuid
      and organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and resolution_status='linked' and resolved_job_id='tenant-ci-job-a'
      and resolution_note='validated fixture resolution' and resolved_by='tenant-ci-a'
      and resolved_at is not null
  ) or not exists (
    select 1 from public.maestro_job_tasks
    where organization_id='00000000-0000-0000-0000-00000000a001'::uuid
      and legacy_record_id='tenant-ci-reconciliation-task'
      and job_id='00000000-0000-0000-0000-00000000a401'::uuid and resolution_status='linked'
  ) then raise exception 'TEST_FAIL reconciliation did not atomically link the relational task and queue row'; end if;
  if (select count(*) from public.job_task_reconciliation
      where id in ('00000000-0000-0000-0000-00000000a502'::uuid,
        '00000000-0000-0000-0000-00000000a503'::uuid)
        and resolution_status='pending' and resolved_job_id is null) <> 2
    or not exists (
      select 1 from public.maestro_job_tasks
      where organization_id='00000000-0000-0000-0000-00000000a001'::uuid
        and legacy_record_id='tenant-ci-reconciliation-already-linked'
        and job_id='00000000-0000-0000-0000-00000000a401'::uuid
        and resolution_status='linked'
    ) then
    raise exception 'TEST_FAIL rejected reconciliation changed a queue row or an already-linked task';
  end if;
end;
$verify_service_role_core_writes$;
do $verify_legacy_projection_reference_compatibility$
begin
  if exists (
    select 1 from public.legacy_records
    where record_id in ('tenant-ci-cross-project-client', 'tenant-ci-cross-job-client', 'tenant-ci-cross-job-project',
      'tenant-ci-cross-tenant-projection-task', 'tenant-ci-cross-tenant-projection-entry')
  ) then raise exception 'TEST_FAIL rejected cross-tenant legacy core write persisted'; end if;
  if exists (
    select 1 from public.maestro_job_tasks
    where legacy_record_id='tenant-ci-cross-tenant-projection-task'
  ) or exists (
    select 1 from public.maestro_financial_entries
    where legacy_record_id='tenant-ci-cross-tenant-projection-entry'
  ) or exists (
    select 1 from public.organization_legacy_records
    where legacy_record_id in ('tenant-ci-cross-tenant-projection-task', 'tenant-ci-cross-tenant-projection-entry')
  ) then raise exception 'TEST_FAIL rejected legacy dual-write left a projection or tenant mapping'; end if;
  if not exists (
    select 1 from public.legacy_records l
    join public.maestro_projects p on p.organization_id=l.organization_id and p.legacy_record_id=l.record_id
    where l.record_id='tenant-ci-unresolved-project'
      and p.client_id is null and p.client_legacy_record_id='tenant-ci-unknown-client'
  ) then raise exception 'TEST_FAIL unresolved legacy Project reference was not preserved'; end if;
end;
$verify_legacy_projection_reference_compatibility$;

-- The privileged admin RPCs must never cross the organization supplied by the
-- authenticated edge-session adapter. Deletes and audit snapshots are atomic;
-- reset updates only running relational projections in that organization.
insert into public.maestro_timesheets (
  organization_id, legacy_record_id, source_payload, is_running, started_at
)
values
  ('00000000-0000-0000-0000-00000000a001', 'tenant-ci-timesheet-delete-a', '{"id":"tenant-ci-timesheet-delete-a"}', false, now()),
  ('00000000-0000-0000-0000-00000000b001', 'tenant-ci-timesheet-delete-b', '{"id":"tenant-ci-timesheet-delete-b"}', false, now()),
  ('00000000-0000-0000-0000-00000000a001', 'tenant-ci-timesheet-running-a', '{"id":"tenant-ci-timesheet-running-a"}', true, now() - interval '20 minutes'),
  ('00000000-0000-0000-0000-00000000b001', 'tenant-ci-timesheet-running-b', '{"id":"tenant-ci-timesheet-running-b"}', true, now() - interval '20 minutes');

set local role service_role;
do $timesheet_admin_scope$
declare
  deleted_count bigint;
  stopped_count bigint;
begin
  deleted_count := public.maestro_delete_timesheets_with_audit(
    '00000000-0000-0000-0000-00000000a001'::uuid,
    array['tenant-ci-timesheet-delete-a', 'tenant-ci-timesheet-delete-b'],
    '00000000-0000-0000-0000-00000000a101', 'Tenant CI A', 'tenant isolation test'
  );
  if deleted_count <> 1 then
    raise exception 'Scoped timesheet delete expected 1 row, got %.', deleted_count;
  end if;

  stopped_count := public.maestro_reset_running_timesheets('00000000-0000-0000-0000-00000000a001'::uuid);
  if stopped_count <> 1 then
    raise exception 'Scoped timesheet reset expected 1 row, got %.', stopped_count;
  end if;
end;
$timesheet_admin_scope$;
reset role;

do $timesheet_admin_persisted_scope$
begin
  if exists (select 1 from public.maestro_timesheets where legacy_record_id = 'tenant-ci-timesheet-delete-a')
    or not exists (select 1 from public.maestro_timesheets where legacy_record_id = 'tenant-ci-timesheet-delete-b') then
    raise exception 'Timesheet delete crossed organization scope or failed to delete target.';
  end if;
  if not exists (
    select 1 from public.legacy_records
    where entity = 'DeleteLog' and organization_id = '00000000-0000-0000-0000-00000000a001'::uuid
      and payload->>'entity_id' = 'tenant-ci-timesheet-delete-a'
  ) then
    raise exception 'Timesheet delete did not create an organization-scoped audit snapshot.';
  end if;
  if exists (select 1 from public.maestro_timesheets where legacy_record_id = 'tenant-ci-timesheet-running-a' and is_running is true)
    or not exists (select 1 from public.maestro_timesheets where legacy_record_id = 'tenant-ci-timesheet-running-b' and is_running is true) then
    raise exception 'Timesheet reset crossed organization scope or failed to stop target.';
  end if;
end;
$timesheet_admin_persisted_scope$;

do $cross_tenant_constraints$
begin
  begin
    insert into public.maestro_projects (
      organization_id, legacy_record_id, client_id, client_legacy_record_id, name
    ) values (
      '00000000-0000-0000-0000-00000000a001', 'tenant-ci-invalid-project',
      '00000000-0000-0000-0000-00000000b201', 'tenant-ci-client-b', 'Invalid cross-tenant project'
    );
    raise exception 'Cross-tenant project/client reference was accepted.';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.maestro_jobs (
      organization_id, legacy_record_id, project_id, project_legacy_record_id, title
    ) values (
      '00000000-0000-0000-0000-00000000b001', 'tenant-ci-invalid-job',
      '00000000-0000-0000-0000-00000000a301', 'tenant-ci-project-a', 'Invalid cross-tenant job'
    );
    raise exception 'Cross-tenant job/project reference was accepted.';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.maestro_job_tasks (
      organization_id, legacy_record_id, legacy_job_record_id, job_id, title, responsible_id
    ) values (
      '00000000-0000-0000-0000-00000000a001', 'tenant-ci-invalid-task-job', 'tenant-ci-job-b',
      '00000000-0000-0000-0000-00000000b401', 'Invalid cross-tenant task job',
      '00000000-0000-0000-0000-00000000a101'
    );
    raise exception 'Cross-tenant task/job reference was accepted.';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.maestro_job_tasks (
      organization_id, legacy_record_id, legacy_job_record_id, job_id, title, responsible_id
    ) values (
      '00000000-0000-0000-0000-00000000a001', 'tenant-ci-invalid-task-assignee', 'tenant-ci-job-a',
      '00000000-0000-0000-0000-00000000a401', 'Invalid cross-tenant task assignee',
      '00000000-0000-0000-0000-00000000b101'
    );
    raise exception 'Cross-tenant task assignee was accepted.';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.maestro_financial_entries (
      organization_id, legacy_record_id, bank_account_legacy_record_id, title
    ) values (
      '00000000-0000-0000-0000-00000000a001', 'tenant-ci-invalid-financial-account',
      'tenant-ci-account-b', 'Invalid cross-tenant financial account'
    );
    raise exception 'Cross-tenant financial bank account was accepted.';
  exception when foreign_key_violation then
    null;
  end;
end;
$cross_tenant_constraints$;

do $financial_access$
declare
  table_name text;
  privilege_name text;
begin
  foreach table_name in array array[
    'maestro_financial_entries', 'maestro_bank_accounts',
    'maestro_cost_centers', 'maestro_financial_categories'
  ] loop
    foreach privilege_name in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] loop
      if has_table_privilege('anon', format('public.%I', table_name), privilege_name)
        or has_table_privilege('authenticated', format('public.%I', table_name), privilege_name) then
        raise exception 'Browser role has % on public.%.', privilege_name, table_name;
      end if;
    end loop;
    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', format('public.%I', table_name), privilege_name) then
        raise exception 'service_role is missing % on public.%.', privilege_name, table_name;
      end if;
    end loop;
  end loop;
end;
$financial_access$;

rollback;
