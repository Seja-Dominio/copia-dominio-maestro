-- Rollback-only contract for tenant-scoped MiniTask/DeleteLog projections.
-- Run only in an isolated database with the task-audit migration installed.
begin;

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
  v_active_assignee text := 'task-assignee-active-' || gen_random_uuid()::text;
  v_inactive_assignee text := 'task-assignee-inactive-' || gen_random_uuid()::text;
  v_other_tenant_assignee text := 'task-assignee-other-' || gen_random_uuid()::text;
  v_inactive_task text := 'task-scope-inactive-' || gen_random_uuid()::text;
  v_cross_tenant_task text := 'task-scope-cross-tenant-' || gen_random_uuid()::text;
begin
  insert into public.organizations(id, name, slug, status, created_at)
  values
    (v_other_org, 'Task scope older tenant', 'task-scope-' || left(v_other_org::text, 8), 'active', now() - interval '1 day'),
    (v_org, 'Task scope test tenant', 'task-scope-' || left(v_org::text, 8), 'active', now());

  insert into public.maestro_collaborators(id, login, is_active)
  values
    (v_active_assignee, v_active_assignee, true),
    (v_inactive_assignee, v_inactive_assignee, false),
    (v_other_tenant_assignee, v_other_tenant_assignee, true);
  insert into public.organization_members(organization_id, collaborator_id, role, status)
  values
    (v_org, v_active_assignee, 'member', 'active'),
    (v_other_org, v_other_tenant_assignee, 'member', 'active');

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
  values (v_org, 'MiniTask', v_task, jsonb_build_object('id', v_task, 'title', 'Scoped task audit test', 'collaborator_id', v_active_assignee));
  if not exists (
    select 1 from public.maestro_mini_tasks
    where legacy_record_id=v_task and organization_id=v_org and title='Scoped task audit test'
      and collaborator_legacy_record_id=v_active_assignee and collaborator_id=v_active_assignee
  ) then raise exception 'TEST_FAIL valid assignee was not represented as snapshot and typed relation'; end if;

  -- A deactivated collaborator remains in the source snapshot but has no current membership relation.
  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'MiniTask', v_inactive_task, jsonb_build_object('id', v_inactive_task, 'title', 'Historical assignee', 'collaborator_id', v_inactive_assignee));
  if not exists (
    select 1 from public.maestro_mini_tasks
    where legacy_record_id=v_inactive_task and organization_id=v_org
      and collaborator_legacy_record_id=v_inactive_assignee and collaborator_id is null
      and task_payload->>'collaborator_id'=v_inactive_assignee
  ) then raise exception 'TEST_FAIL inactive assignee snapshot was not preserved independently of typed relation'; end if;

  update public.legacy_records
  set payload=payload || jsonb_build_object('title', 'Historical assignee updated')
  where entity='MiniTask' and record_id=v_inactive_task and organization_id=v_org;
  if not exists (
    select 1 from public.maestro_mini_tasks
    where legacy_record_id=v_inactive_task and title='Historical assignee updated'
      and collaborator_legacy_record_id=v_inactive_assignee and collaborator_id is null
  ) then raise exception 'TEST_FAIL dual-write update rejected or erased a deactivated assignee snapshot'; end if;

  -- A legacy cross-tenant identifier is never converted into a typed relation for this task.
  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'MiniTask', v_cross_tenant_task, jsonb_build_object('id', v_cross_tenant_task, 'title', 'Cross-tenant snapshot', 'collaborator_id', v_other_tenant_assignee));
  if not exists (
    select 1 from public.maestro_mini_tasks
    where legacy_record_id=v_cross_tenant_task and organization_id=v_org
      and collaborator_legacy_record_id=v_other_tenant_assignee and collaborator_id is null
  ) then raise exception 'TEST_FAIL cross-tenant legacy assignee was attached as a current relation'; end if;
end;
$verify$;

rollback;
