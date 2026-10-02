-- Rollback-only contract for audited financial-entry deletes.
-- Run only against the disposable local verification database or isolated preview.
begin;
set local role service_role;

do $preflight$
begin
  if to_regclass('public.maestro_clients') is null
    or to_regclass('public.maestro_financial_entries') is null
    or to_regclass('public.maestro_delete_logs') is null
    or to_regprocedure('public.maestro_delete_financial_entry_scoped(uuid,text,text,text)') is null then
    raise exception 'TEST_PREREQUISITE client/financial-entry/delete-log projection schema or financial delete RPC is not installed';
  end if;
end;
$preflight$;

do $verify$
declare
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_client text := 'atomic-delete-client-' || gen_random_uuid()::text;
  v_entry text := 'atomic-delete-entry-' || gen_random_uuid()::text;
  v_result jsonb;
  v_financial_payload jsonb;
  v_delete_log_id text;
  v_deleted_payload jsonb;
begin
  insert into public.organizations(id, name, slug, status, created_at)
  values
    (v_other_org, 'Atomic delete older tenant', 'atomic-delete-' || left(v_other_org::text, 8), 'active', now() - interval '1 day'),
    (v_org, 'Atomic delete test tenant', 'atomic-delete-' || left(v_org::text, 8), 'active', now());

  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'Client', v_client, jsonb_build_object('id', v_client, 'name', 'Atomic delete test client'));

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

reset role;
rollback;
