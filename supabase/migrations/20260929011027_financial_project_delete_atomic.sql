-- Keep project deletes in the audited legacy mutation transaction while
-- removing the relational projection in that same transaction.
create or replace function public.maestro_apply_legacy_mutation_scoped(
  p_organization_id uuid,
  p_action text,
  p_entity text,
  p_record_id text,
  p_payload jsonb,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid;
  result jsonb;
begin
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then
    raise exception 'organization is not active';
  end if;

  if p_action in ('update', 'delete') then
    select organization_id into current_org
    from public.legacy_records
    where entity = p_entity and record_id = p_record_id;
    if current_org is distinct from p_organization_id then
      raise exception 'record does not belong to organization';
    end if;
  end if;

  perform set_config('maestro.organization_id', p_organization_id::text, true);
  select public.maestro_apply_legacy_mutation(
    p_action, p_entity, p_record_id, coalesce(p_payload, '{}'::jsonb), p_actor_id, p_actor_name
  ) into result;

  if p_action = 'delete' and p_entity = 'Project'
    and to_regclass('public.maestro_projects') is not null then
    delete from public.maestro_projects
    where organization_id = p_organization_id and legacy_record_id = p_record_id;
  end if;

  return result;
end;
$$;

revoke all on function public.maestro_apply_legacy_mutation_scoped(uuid, text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_apply_legacy_mutation_scoped(uuid, text, text, text, jsonb, text, text)
  to service_role;

-- FinancialEntry uses a dedicated atomic delete because the generic audited
-- mutation RPC is intentionally limited to operational work entities.
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
  deleted_at timestamptz := clock_timestamp();
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
    'SystemAuditLog', audit_id, p_organization_id,
    jsonb_build_object(
      'id', audit_id,
      'action', 'delete',
      'entity', 'FinancialEntry',
      'record_id', p_record_id,
      'actor_id', p_actor_id,
      'actor_name', coalesce(nullif(p_actor_name, ''), 'Sistema'),
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

  return jsonb_build_object('id', p_record_id, 'deleted', true);
end;
$$;

revoke all on function public.maestro_delete_financial_entry_scoped(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_delete_financial_entry_scoped(uuid, text, text, text)
  to service_role;
