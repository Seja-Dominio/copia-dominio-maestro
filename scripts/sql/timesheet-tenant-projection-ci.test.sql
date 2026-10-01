-- Synthetic, transaction-only test for the Timesheet forward reconciliation.
-- The migration barrier lets a schema-only Dev clone test a missing table,
-- while CI replays the migration a second time to assert idempotency.
begin;

do $$
begin
  if exists (
    select 1 from public.organizations
    where id in (
      '00000000-0000-0000-0000-00000000c121'::uuid,
      '00000000-0000-0000-0000-00000000c122'::uuid
    )
  ) then raise exception 'Timesheet fixture IDs already exist; refusing to run.'; end if;
end;
$$;

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-0000-0000-00000000c121', 'Timesheet CI A', 'timesheet-ci-a'),
  ('00000000-0000-0000-0000-00000000c122', 'Timesheet CI B', 'timesheet-ci-b');

insert into public.maestro_jobs (id, organization_id, legacy_record_id, title)
values
  ('00000000-0000-0000-0000-00000000c123', '00000000-0000-0000-0000-00000000c121', 'timesheet-ci-job-a', 'Timesheet CI Job A'),
  ('00000000-0000-0000-0000-00000000c124', '00000000-0000-0000-0000-00000000c122', 'timesheet-ci-job-b', 'Timesheet CI Job B');

insert into public.organization_legacy_records (
  organization_id, legacy_entity, legacy_record_id, scope_status, source
) values
  ('00000000-0000-0000-0000-00000000c121', 'Timesheet', 'timesheet-ci-valid', 'confirmed', 'fixture'),
  ('00000000-0000-0000-0000-00000000c121', 'Timesheet', 'timesheet-ci-orphan', 'confirmed', 'fixture'),
  ('00000000-0000-0000-0000-00000000c121', 'Timesheet', 'timesheet-ci-cross', 'confirmed', 'fixture'),
  ('00000000-0000-0000-0000-00000000c122', 'Timesheet', 'timesheet-ci-write', 'confirmed', 'fixture'),
  ('00000000-0000-0000-0000-00000000c122', 'Timesheet', 'timesheet-ci-invalid-write', 'confirmed', 'fixture');

-- Seed preexisting legacy rows without the currently installed dual-write so
-- both the absent-relation Dev case and the deployed-table repair case exercise
-- the migration's own backfill logic.
do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public' and r.relname = 'legacy_records'
      and t.tgname = 'legacy_records_relational_timesheet_sync' and not t.tgisinternal
  ) then
    alter table public.legacy_records disable trigger legacy_records_relational_timesheet_sync;
  end if;
end;
$$;

insert into public.legacy_records (entity, record_id, organization_id, payload)
values
  ('Timesheet', 'timesheet-ci-valid', '00000000-0000-0000-0000-00000000c121',
    '{"job_id":"timesheet-ci-job-a","duration_minutes":"45","started_at":"2026-10-01T09:00:00Z","ended_at":"2026-10-01T09:45:00Z"}'),
  ('Timesheet', 'timesheet-ci-orphan', '00000000-0000-0000-0000-00000000c121',
    '{"job_id":"missing-timesheet-ci-job","duration_minutes":"12"}'),
  ('Timesheet', 'timesheet-ci-cross', '00000000-0000-0000-0000-00000000c121',
    '{"job_id":"timesheet-ci-job-b","duration_minutes":"12"}'),
  ('Timesheet', 'timesheet-ci-invalid-write', '00000000-0000-0000-0000-00000000c122',
    '{"job_id":"timesheet-ci-job-b","duration_minutes":"2147483648","started_at":"not-a-timestamp","ended_at":"not-a-timestamp","is_running":"unknown"}');

do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public' and r.relname = 'legacy_records'
      and t.tgname = 'legacy_records_relational_timesheet_sync' and not t.tgisinternal
  ) then
    alter table public.legacy_records enable trigger legacy_records_relational_timesheet_sync;
  end if;
end;
$$;

-- TIMESHEET_MIGRATION_BARRIER

do $$
begin
  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id = '00000000-0000-0000-0000-00000000c121'
      and legacy_record_id = 'timesheet-ci-valid'
      and job_id = '00000000-0000-0000-0000-00000000c123'
      and duration_minutes = 45
      and started_at = '2026-10-01T09:00:00Z'::timestamptz
      and ended_at = '2026-10-01T09:45:00Z'::timestamptz
  ) then raise exception 'Valid Timesheet backfill was not projected.'; end if;

  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id = '00000000-0000-0000-0000-00000000c121'
      and legacy_record_id = 'timesheet-ci-orphan'
      and job_id is null and legacy_job_record_id = 'missing-timesheet-ci-job'
  ) then raise exception 'Unmatched Job pointer was not safely preserved.'; end if;

  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id = '00000000-0000-0000-0000-00000000c121'
      and legacy_record_id = 'timesheet-ci-cross'
      and job_id is null and legacy_job_record_id = 'timesheet-ci-job-b'
  ) then raise exception 'Cross-tenant Job pointer was not kept nullable.'; end if;

  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id = '00000000-0000-0000-0000-00000000c122'
      and legacy_record_id = 'timesheet-ci-invalid-write'
      and duration_minutes is null and started_at is null and ended_at is null and is_running is null
  ) then raise exception 'Invalid source values should remain unprojected.'; end if;

  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets') <> 4 then
    raise exception 'Expected all four tenant-aware Timesheet policies.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.maestro_timesheets'::regclass) then
    raise exception 'Timesheet row-level security is disabled.';
  end if;
  if has_table_privilege('anon', 'public.maestro_timesheets', 'select')
    or has_table_privilege('authenticated', 'public.maestro_timesheets', 'select') then
    raise exception 'Authenticated role has an unexpected direct Data API grant.';
  end if;
  if not has_table_privilege('service_role', 'public.maestro_timesheets', 'insert') then
    raise exception 'service_role cannot maintain the relational projection.';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'public.maestro_sync_relational_timesheet()'::regprocedure
      and not prosecdef and proconfig @> array['search_path=""']::text[]
  ) then raise exception 'Timesheet trigger function must be invoker with an empty search_path.'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_timesheets'::regclass
      and conname in (
        'maestro_timesheets_org_job_fk',
        'maestro_timesheets_org_client_identity_fk',
        'maestro_timesheets_org_project_identity_fk'
      )
    group by conrelid having count(*) = 3 and bool_and(convalidated)
  ) then raise exception 'Tenant-aware Timesheet foreign keys are not all validated.'; end if;
end;
$$;

set local role service_role;

insert into public.legacy_records (entity, record_id, organization_id, payload)
values
  ('Timesheet', 'timesheet-ci-write', '00000000-0000-0000-0000-00000000c122',
    '{"job_id":"timesheet-ci-job-b","duration_minutes":"18","started_at":"2026-10-02T10:00:00Z","ended_at":"2026-10-02T10:18:00Z"}'),
  ('Timesheet', 'timesheet-ci-invalid-trigger', '00000000-0000-0000-0000-00000000c122',
    '{"job_id":"timesheet-ci-job-b","duration_minutes":"2147483648","started_at":"not-a-timestamp","ended_at":"not-a-timestamp","is_rework":"unknown"}');

do $$
begin
  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id = '00000000-0000-0000-0000-00000000c122'
      and legacy_record_id = 'timesheet-ci-write'
      and job_id = '00000000-0000-0000-0000-00000000c124'
      and duration_minutes = 18
  ) then raise exception 'service_role dual-write failed for the second tenant.'; end if;

  if not exists (
    select 1 from public.maestro_timesheets
    where legacy_record_id = 'timesheet-ci-invalid-trigger'
      and duration_minutes is null and started_at is null and ended_at is null and is_rework is null
  ) then raise exception 'Dual-write should ignore invalid optional source values safely.'; end if;

  begin
    insert into public.maestro_timesheets (organization_id, legacy_record_id, job_id, source_payload)
    values (
      '00000000-0000-0000-0000-00000000c121', 'timesheet-ci-cross-fk',
      '00000000-0000-0000-0000-00000000c124', '{}'
    );
    raise exception 'Cross-tenant Job foreign key unexpectedly accepted the relation.';
  exception when foreign_key_violation then
    null;
  end;
end;
$$;

reset role;
rollback;
