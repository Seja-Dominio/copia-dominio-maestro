-- Keep the financial delete recovery snapshot, system audit, legacy row, and
-- relational projection in one transaction, matching the operational delete
-- contract while preserving tenant scoping and the service-role-only RPC.
create or replace function public.maestro_delete_financial_entry_scoped(
  p_organization_id uuid,
  p_record_id text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_entry public.legacy_records%rowtype;
  audit_id text := replace(gen_random_uuid()::text, '-', '');
  delete_log_id text := replace(gen_random_uuid()::text, '-', '');
  deleted_at timestamptz := clock_timestamp();
  actor_name text := coalesce(nullif(p_actor_name, ''), 'Sistema');
begin
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then
    raise exception 'organization is not active';
  end if;

  select * into current_entry
  from public.legacy_records
  where organization_id = p_organization_id
    and entity = 'FinancialEntry'
    and record_id = p_record_id
  for update;

  if not found then
    raise exception 'financial entry does not belong to organization or was not found';
  end if;

  insert into public.legacy_records (
    entity, record_id, organization_id, payload, source_created_at, source_updated_at
  ) values (
    'DeleteLog', delete_log_id, p_organization_id,
    jsonb_build_object(
      'id', delete_log_id,
      'entity_type', 'financial_entry',
      'entity_id', p_record_id,
      'entity_data', coalesce(current_entry.payload, '{}'::jsonb)
        || jsonb_build_object('id', p_record_id),
      'deleted_by', coalesce(nullif(p_actor_id, ''), 'system'),
      'deleted_by_name', actor_name,
      'deleted_at', deleted_at,
      'reason', '',
      'is_restored', false
    ),
    deleted_at, deleted_at
  );

  insert into public.legacy_records (
    entity, record_id, organization_id, payload, source_created_at, source_updated_at
  ) values (
    'SystemAuditLog', audit_id, p_organization_id,
    jsonb_build_object(
      'id', audit_id,
      'action', 'delete',
      'entity', 'FinancialEntry',
      'record_id', p_record_id,
      'actor_id', p_actor_id,
      'actor_name', actor_name,
      'before', current_entry.payload,
      'after', null,
      'occurred_at', deleted_at
    ),
    deleted_at, deleted_at
  );

  if to_regclass('public.maestro_financial_entries') is not null then
    execute 'delete from public.maestro_financial_entries where organization_id = $1 and legacy_record_id = $2'
      using p_organization_id, p_record_id;
  end if;

  delete from public.legacy_records
  where organization_id = p_organization_id
    and entity = 'FinancialEntry'
    and record_id = p_record_id;

  return jsonb_build_object('id', p_record_id, 'deleted', true, 'delete_log_id', delete_log_id);
end;
$$;

revoke all on function public.maestro_delete_financial_entry_scoped(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_delete_financial_entry_scoped(uuid, text, text, text)
  to service_role;
