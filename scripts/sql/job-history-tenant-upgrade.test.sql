-- Upgrade fixture for a schema baseline with the pre-fix JobHistory trigger.
-- The runner inserts 20261002150000_restore_tenant_scoped_job_history_projection.sql
-- at the barrier, then verifies tenant-safe history dual-write behavior.
-- Use only in a disposable clone/CI transaction; this file ends with ROLLBACK.
begin;

do $preflight$
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.legacy_records') is null
    or to_regclass('public.organization_legacy_records') is null
    or to_regclass('public.maestro_jobs') is null
    or to_regclass('public.maestro_job_history') is null
    or not exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='legacy_records'
        and t.tgfoid=to_regprocedure('public.maestro_sync_relational_job_history()')
        and not t.tgisinternal and t.tgenabled <> 'D'
    ) then
    raise exception 'JobHistory tenant-upgrade fixture prerequisites are missing';
  end if;
  if exists (select 1 from public.organizations where id in (
      '00000000-0000-0000-0000-00000000e001'::uuid,
      '00000000-0000-0000-0000-00000000e002'::uuid
    ))
    or exists (select 1 from public.legacy_records where record_id in (
      'job-history-upgrade-same-tenant',
      'job-history-upgrade-cross-tenant',
      'job-history-upgrade-orphan'
    ))
    or exists (select 1 from public.maestro_jobs where id in (
      '00000000-0000-0000-0000-00000000e401'::uuid,
      '00000000-0000-0000-0000-00000000e402'::uuid
    ) or legacy_record_id in ('job-history-upgrade-job-a','job-history-upgrade-job-b'))
    or exists (select 1 from public.organization_legacy_records
      where legacy_entity='JobHistory' and legacy_record_id in (
        'job-history-upgrade-same-tenant',
        'job-history-upgrade-cross-tenant',
        'job-history-upgrade-orphan'
      ))
    or exists (select 1 from public.maestro_job_history where legacy_record_id in (
      'job-history-upgrade-same-tenant',
      'job-history-upgrade-cross-tenant',
      'job-history-upgrade-orphan'
    )) then
    raise exception 'JobHistory tenant-upgrade fixture collision; refusing to run';
  end if;
end;
$preflight$;

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-0000-0000-00000000e001', 'JobHistory Upgrade A', 'job-history-upgrade-a'),
  ('00000000-0000-0000-0000-00000000e002', 'JobHistory Upgrade B', 'job-history-upgrade-b');

insert into public.maestro_jobs (id, organization_id, legacy_record_id, title)
values
  ('00000000-0000-0000-0000-00000000e401', '00000000-0000-0000-0000-00000000e001', 'job-history-upgrade-job-a', 'Tenant A Job'),
  ('00000000-0000-0000-0000-00000000e402', '00000000-0000-0000-0000-00000000e002', 'job-history-upgrade-job-b', 'Tenant B Job');

-- MIGRATION_BARRIER: apply 20261002150000_restore_tenant_scoped_job_history_projection.sql here.

set local role service_role;

insert into public.legacy_records (organization_id, entity, record_id, payload)
values (
  '00000000-0000-0000-0000-00000000e001', 'JobHistory', 'job-history-upgrade-same-tenant',
  '{"job_id":"job-history-upgrade-job-a","type":"status_changed","text":"same tenant"}'::jsonb
);

do $same_tenant_assertion$
begin
  if not exists (
    select 1 from public.maestro_job_history h
    join public.maestro_jobs j on j.id=h.job_id and j.organization_id=h.organization_id
    where h.organization_id='00000000-0000-0000-0000-00000000e001'::uuid
      and h.legacy_record_id='job-history-upgrade-same-tenant'
      and j.legacy_record_id='job-history-upgrade-job-a'
  ) then
    raise exception 'Same-tenant JobHistory reference was not projected';
  end if;
end;
$same_tenant_assertion$;

do $cross_tenant_assertion$
declare
  v_message text;
begin
  begin
    insert into public.legacy_records (organization_id, entity, record_id, payload)
    values (
      '00000000-0000-0000-0000-00000000e001', 'JobHistory', 'job-history-upgrade-cross-tenant',
      '{"job_id":"job-history-upgrade-job-b","type":"status_changed","text":"must reject"}'::jsonb
    );
    raise exception 'TEST_FAIL cross-tenant JobHistory reference was accepted';
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message = 'TEST_FAIL cross-tenant JobHistory reference was accepted'
      or v_message <> 'Job history job must belong to the same organization' then
      raise exception 'Unexpected cross-tenant JobHistory result: %', v_message;
    end if;
  end;
  if exists (select 1 from public.legacy_records where record_id='job-history-upgrade-cross-tenant')
    or exists (select 1 from public.maestro_job_history where legacy_record_id='job-history-upgrade-cross-tenant') then
    raise exception 'Rejected cross-tenant JobHistory left persisted rows';
  end if;
end;
$cross_tenant_assertion$;

insert into public.legacy_records (organization_id, entity, record_id, payload)
values (
  '00000000-0000-0000-0000-00000000e001', 'JobHistory', 'job-history-upgrade-orphan',
  '{"job_id":"deleted-or-unprojected-job","type":"status_changed","text":"preserve snapshot"}'::jsonb
);

do $orphan_assertion$
begin
  if not exists (
    select 1 from public.maestro_job_history
    where organization_id='00000000-0000-0000-0000-00000000e001'::uuid
      and legacy_record_id='job-history-upgrade-orphan'
      and job_legacy_id='deleted-or-unprojected-job' and job_id is null
      and source_payload ->> 'text' = 'preserve snapshot'
  ) then
    raise exception 'Unresolved JobHistory parent was not preserved as a tenant-scoped snapshot';
  end if;
end;
$orphan_assertion$;

reset role;
rollback;
