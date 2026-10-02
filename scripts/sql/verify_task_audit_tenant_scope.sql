-- Rollback-only contract for tenant-scoped MiniTask/DeleteLog projections.
-- Run only in an isolated database with the task-audit migration installed.
begin;
set local role service_role;

do $preflight$
begin
  if to_regclass('public.maestro_mini_tasks') is null
    or to_regclass('public.maestro_delete_logs') is null
    or to_regprocedure('public.maestro_sync_task_audit_log()') is null
    or not exists (
      select 1 from pg_trigger
      where tgrelid = 'public.legacy_records'::regclass
        and tgname = 'legacy_records_task_audit_sync'
        and not tgisinternal
    ) then
    raise exception 'TEST_PREREQUISITE task-audit projection schema or trigger is not installed';
  end if;
end;
$preflight$;

do $verify$
declare
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_task text := 'task-scope-' || gen_random_uuid()::text;
begin
  insert into public.organizations(id, name, slug, status, created_at)
  values
    (v_other_org, 'Task scope older tenant', 'task-scope-' || left(v_other_org::text, 8), 'active', now() - interval '1 day'),
    (v_org, 'Task scope test tenant', 'task-scope-' || left(v_org::text, 8), 'active', now());

  perform set_config('maestro.organization_id', '', true);
  begin
    insert into public.legacy_records(entity, record_id, payload)
    values ('MiniTask', v_task || '-unscoped', jsonb_build_object('id', v_task || '-unscoped', 'title', 'Must be rejected'));
    raise exception 'TEST_FAIL unscoped task write was accepted with multiple active tenants';
  exception when others then
    if sqlerrm = 'TEST_FAIL unscoped task write was accepted with multiple active tenants' then raise; end if;
    if sqlerrm not like 'tenant scope required for MiniTask record %' then raise; end if;
  end;
  if exists (select 1 from public.legacy_records where record_id=v_task || '-unscoped') then
    raise exception 'TEST_FAIL rejected unscoped task write left a legacy row';
  end if;

  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'MiniTask', v_task, jsonb_build_object('id', v_task, 'title', 'Scoped task audit test'));
  if not exists (
    select 1 from public.maestro_mini_tasks
    where legacy_record_id=v_task and organization_id=v_org and title='Scoped task audit test'
  ) then raise exception 'TEST_FAIL task audit projection was attached to another tenant'; end if;
end;
$verify$;

reset role;
rollback;
