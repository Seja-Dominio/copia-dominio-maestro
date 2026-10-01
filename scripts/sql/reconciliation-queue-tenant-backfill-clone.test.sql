-- Synthetic rollback-only test for Dev baselines whose reconciliation queue
-- predates its organization_id column. Apply only to a disposable clone whose
-- public.job_task_reconciliation has no organization_id column.
begin;

-- Recreate the schema gap transactionally when running from a clean replay DB.
-- The test is always rolled back; never run it outside a disposable clone.
alter table public.job_task_reconciliation
  drop constraint if exists job_task_reconciliation_organization_fk;
alter table public.job_task_reconciliation
  drop column if exists organization_id cascade;

do $preflight$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_task_reconciliation'
      and column_name = 'organization_id'
  ) then
    raise exception 'Expected a Dev-shaped queue without organization_id; refusing to run.';
  end if;
  if exists (
    select 1 from public.organizations
    where id in (
      '00000000-0000-0000-0000-00000000d101'::uuid,
      '00000000-0000-0000-0000-00000000d102'::uuid
    )
  ) then
    raise exception 'Reconciliation queue fixture IDs already exist; refusing to run.';
  end if;
end;
$preflight$;

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-0000-0000-00000000d101', 'Queue Scope CI A', 'queue-scope-ci-a'),
  ('00000000-0000-0000-0000-00000000d102', 'Queue Scope CI B', 'queue-scope-ci-b');

insert into public.organization_legacy_records (
  organization_id, legacy_entity, legacy_record_id, scope_status, source
) values
  ('00000000-0000-0000-0000-00000000d101', 'Subtask', 'queue-scope-ci-a', 'confirmed', 'fixture'),
  ('00000000-0000-0000-0000-00000000d102', 'Subtask', 'queue-scope-ci-b', 'confirmed', 'fixture');

insert into public.job_task_reconciliation (
  id, legacy_entity, legacy_record_id, legacy_job_id, payload, source_status
) values
  ('00000000-0000-0000-0000-00000000d103', 'Subtask', 'queue-scope-ci-a', 'legacy-job-a', '{}'::jsonb, 'pending'),
  ('00000000-0000-0000-0000-00000000d104', 'Subtask', 'queue-scope-ci-b', 'legacy-job-b', '{}'::jsonb, 'pending');

-- MIGRATION_BARRIER: apply 20260930180000_fix_reconciliation_invoker_privileges.sql here.

do $assertions$
begin
  if not exists (
    select 1 from public.job_task_reconciliation
    where id = '00000000-0000-0000-0000-00000000d103'
      and organization_id = '00000000-0000-0000-0000-00000000d101'
  ) or not exists (
    select 1 from public.job_task_reconciliation
    where id = '00000000-0000-0000-0000-00000000d104'
      and organization_id = '00000000-0000-0000-0000-00000000d102'
  ) then
    raise exception 'The reconciliation queue tenant backfill mapped a row to the wrong organization.';
  end if;

  if exists (
    select 1 from public.job_task_reconciliation
    where id in (
      '00000000-0000-0000-0000-00000000d103',
      '00000000-0000-0000-0000-00000000d104'
    ) and organization_id is null
  ) then
    raise exception 'The reconciliation queue tenant backfill left a fixture unscoped.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.job_task_reconciliation'::regclass
      and conname = 'job_task_reconciliation_organization_fk'
      and contype = 'f'
      and convalidated
  ) then
    raise exception 'The reconciliation queue tenant foreign key is missing or unvalidated.';
  end if;
end;
$assertions$;

rollback;
