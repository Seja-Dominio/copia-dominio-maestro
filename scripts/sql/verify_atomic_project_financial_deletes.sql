-- Rollback-only contract for audited project and financial-entry deletes.
-- Run only against the disposable local verification database or isolated preview.
begin;

do $verify$
declare
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_client text := 'atomic-delete-client-' || gen_random_uuid()::text;
  v_project text := 'atomic-delete-project-' || gen_random_uuid()::text;
  v_entry text := 'atomic-delete-entry-' || gen_random_uuid()::text;
  v_task text := 'atomic-delete-task-' || gen_random_uuid()::text;
  v_result jsonb;
  v_financial_payload jsonb;
  v_delete_log_id text;
  v_deleted_payload jsonb;
begin
  insert into public.organizations(id, name, slug, status, created_at)
  values
    (v_other_org, 'Atomic delete older tenant', 'atomic-delete-' || left(v_other_org::text, 8), 'active', now() - interval '1 day'),
    (v_org, 'Atomic delete test tenant', 'atomic-delete-' || left(v_org::text, 8), 'active', now());

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

  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'Client', v_client, jsonb_build_object('id', v_client, 'name', 'Atomic delete test client'));
  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'Project', v_project, jsonb_build_object('id', v_project, 'name', 'Atomic delete test project', 'client_id', v_client));

  if not exists (
    select 1 from public.maestro_projects
    where organization_id = v_org and legacy_record_id = v_project
  ) then raise exception 'TEST_FAIL project fixture was not projected'; end if;

  select public.maestro_apply_legacy_mutation_scoped(
    v_org, 'delete', 'Project', v_project, '{}'::jsonb, 'test-actor', 'Test Actor'
  ) into v_result;

  if coalesce(v_result->>'deleted', 'false') <> 'true'
    or exists (select 1 from public.legacy_records where organization_id=v_org and entity='Project' and record_id=v_project)
    or exists (select 1 from public.maestro_projects where organization_id=v_org and legacy_record_id=v_project)
    or not exists (select 1 from public.legacy_records where organization_id=v_org and entity='DeleteLog' and payload->>'entity_id'=v_project and payload->>'entity_type'='project')
    or not exists (select 1 from public.legacy_records where organization_id=v_org and entity='SystemAuditLog' and payload->>'entity'='Project' and payload->>'record_id'=v_project and payload->>'action'='delete')
  then raise exception 'TEST_FAIL project delete, relational projection, or audit was not atomic'; end if;

  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'FinancialEntry', v_entry, jsonb_build_object(
    'id', v_entry, 'type', 'expense', 'title', 'Atomic delete test expense',
    'amount', '120.50', 'category', 'production', 'client_id', v_client
  ));
  select payload into v_financial_payload from public.legacy_records
  where organization_id=v_org and entity='FinancialEntry' and record_id=v_entry;

  if not exists (
    select 1 from public.maestro_financial_entries
    where organization_id=v_org and legacy_record_id=v_entry and amount=120.50
  ) then raise exception 'TEST_FAIL financial entry fixture was not projected'; end if;

  begin
    perform public.maestro_delete_financial_entry_scoped(v_other_org, v_entry, 'test-actor', 'Test Actor');
    raise exception 'TEST_FAIL cross-tenant financial delete was accepted';
  exception when others then
    if sqlerrm = 'TEST_FAIL cross-tenant financial delete was accepted' then raise; end if;
  end;

  if not exists (select 1 from public.legacy_records where organization_id=v_org and entity='FinancialEntry' and record_id=v_entry)
    or not exists (select 1 from public.maestro_financial_entries where organization_id=v_org and legacy_record_id=v_entry)
  then raise exception 'TEST_FAIL rejected cross-tenant delete changed the financial entry'; end if;

  select public.maestro_delete_financial_entry_scoped(v_org, v_entry, 'test-actor', 'Test Actor') into v_result;
  v_delete_log_id := v_result->>'delete_log_id';
  select payload->'entity_data' into v_deleted_payload from public.legacy_records
  where organization_id=v_org and entity='DeleteLog' and record_id=v_delete_log_id;

  if coalesce(v_result->>'deleted', 'false') <> 'true'
    or v_delete_log_id is null
    or exists (select 1 from public.legacy_records where organization_id=v_org and entity='FinancialEntry' and record_id=v_entry)
    or exists (select 1 from public.maestro_financial_entries where organization_id=v_org and legacy_record_id=v_entry)
    or not exists (select 1 from public.legacy_records where organization_id=v_org and entity='DeleteLog' and record_id=v_delete_log_id and payload->>'entity_id'=v_entry and payload->>'entity_type'='financial_entry')
  then raise exception 'TEST_FAIL financial delete did not remove both source and relational projection, or omitted its recovery log'; end if;

  if v_deleted_payload is distinct from (v_financial_payload || jsonb_build_object('id', v_entry)) then
    raise exception 'TEST_FAIL recovery log does not preserve the exact deleted financial payload';
  end if;

  if not exists (
    select 1 from public.maestro_delete_logs
    where organization_id=v_org and legacy_record_id=v_delete_log_id
      and deleted_entity_legacy_record_id=v_entry
      and deleted_payload=(v_financial_payload || jsonb_build_object('id', v_entry))
      and payload->'entity_data'=(v_financial_payload || jsonb_build_object('id', v_entry))
  ) then raise exception 'TEST_FAIL relational recovery log does not mirror the preserved payload'; end if;

  if not exists (
    select 1 from public.legacy_records
    where organization_id=v_org and entity='SystemAuditLog' and payload->>'entity'='FinancialEntry'
      and payload->>'record_id'=v_entry and payload->>'action'='delete'
      and payload->'before'=(v_financial_payload || jsonb_build_object('id', v_entry))
  ) then raise exception 'TEST_FAIL system audit does not preserve the exact before image'; end if;
end;
$verify$;

rollback;
