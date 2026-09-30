-- Preserve delete recovery and audit records when a frozen entity exists only
-- in its relational table. The relational snapshot is authoritative after cutover.
create or replace function public.maestro_delete_financial_entry_scoped(
  p_organization_id uuid,
  p_record_id text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_legacy public.legacy_records%rowtype;
  v_audit_id text := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_delete_log_id text := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_actor_name text := coalesce(nullif(p_actor_name, ''), 'Sistema');
begin
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    raise exception 'organization is not active';
  end if;

  select f.source_payload into v_payload
  from public.maestro_financial_entries f
  where f.organization_id = p_organization_id and f.legacy_record_id = p_record_id
  for update;

  select * into v_legacy from public.legacy_records l
  where l.organization_id = p_organization_id and l.entity = 'FinancialEntry' and l.record_id = p_record_id
  for update;

  if v_payload is null and found then v_payload := v_legacy.payload; end if;
  if v_payload is null then
    raise exception 'financial entry does not belong to organization or was not found';
  end if;
  v_payload := coalesce(v_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object('id', p_record_id);

  insert into public.legacy_records (entity, record_id, organization_id, payload, source_created_at, source_updated_at)
  values ('DeleteLog', v_delete_log_id, p_organization_id,
    pg_catalog.jsonb_build_object('id', v_delete_log_id, 'entity_type', 'financial_entry',
      'entity_id', p_record_id, 'entity_data', v_payload,
      'deleted_by', coalesce(nullif(p_actor_id, ''), 'system'), 'deleted_by_name', v_actor_name,
      'deleted_at', v_now, 'reason', '', 'is_restored', false), v_now, v_now);

  insert into public.legacy_records (entity, record_id, organization_id, payload, source_created_at, source_updated_at)
  values ('SystemAuditLog', v_audit_id, p_organization_id,
    pg_catalog.jsonb_build_object('id', v_audit_id, 'action', 'delete', 'entity', 'FinancialEntry',
      'record_id', p_record_id, 'actor_id', p_actor_id, 'actor_name', v_actor_name,
      'before', v_payload, 'after', null, 'occurred_at', v_now), v_now, v_now);

  delete from public.legacy_records l where l.organization_id = p_organization_id
    and l.entity = 'FinancialEntry' and l.record_id = p_record_id;
  delete from public.maestro_financial_entries f where f.organization_id = p_organization_id
    and f.legacy_record_id = p_record_id;
  return pg_catalog.jsonb_build_object('id', p_record_id, 'deleted', true, 'delete_log_id', v_delete_log_id);
end;
$$;

revoke all on function public.maestro_delete_financial_entry_scoped(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_delete_financial_entry_scoped(uuid, text, text, text)
  to service_role;

create or replace function public.maestro_delete_project_scoped(
  p_organization_id uuid,
  p_record_id text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_audit_payload jsonb;
  v_audit_id text := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_delete_log_id text := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_actor_name text := coalesce(nullif(p_actor_name, ''), 'Sistema');
begin
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    raise exception 'organization is not active';
  end if;

  select p.source_payload into v_payload
  from public.maestro_projects p
  where p.organization_id = p_organization_id and p.legacy_record_id = p_record_id
  for update;
  if v_payload is null then
    select l.payload into v_payload from public.legacy_records l
    where l.organization_id = p_organization_id and l.entity = 'Project' and l.record_id = p_record_id
    for update;
  end if;
  if v_payload is null then raise exception 'project does not belong to organization or was not found'; end if;
  v_payload := coalesce(v_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object('id', p_record_id);

  v_audit_payload := v_payload;
  if pg_catalog.jsonb_typeof(v_payload -> 'attachments') = 'array' then
    select pg_catalog.jsonb_set(v_payload, '{attachments}',
      coalesce(pg_catalog.jsonb_agg(value - 'url'), '[]'::jsonb), true)
    into v_audit_payload from pg_catalog.jsonb_array_elements(v_payload -> 'attachments') as elements(value);
  end if;

  insert into public.legacy_records (entity, record_id, organization_id, payload, source_created_at, source_updated_at)
  values ('DeleteLog', v_delete_log_id, p_organization_id,
    pg_catalog.jsonb_build_object('id', v_delete_log_id, 'entity_type', 'project',
      'entity_id', p_record_id, 'entity_data', v_audit_payload,
      'deleted_by', coalesce(nullif(p_actor_id, ''), 'system'), 'deleted_by_name', v_actor_name,
      'deleted_at', v_now, 'is_restored', false), v_now, v_now);

  insert into public.legacy_records (entity, record_id, organization_id, payload, source_created_at, source_updated_at)
  values ('SystemAuditLog', v_audit_id, p_organization_id,
    pg_catalog.jsonb_build_object('id', v_audit_id, 'action', 'delete', 'entity', 'Project',
      'record_id', p_record_id, 'actor_id', p_actor_id, 'actor_name', v_actor_name,
      'before', v_audit_payload, 'after', null, 'occurred_at', v_now), v_now, v_now);

  delete from public.legacy_records l where l.organization_id = p_organization_id
    and l.entity = 'Project' and l.record_id = p_record_id;
  delete from public.maestro_projects p where p.organization_id = p_organization_id
    and p.legacy_record_id = p_record_id;
  return pg_catalog.jsonb_build_object('id', p_record_id, 'deleted', true, 'delete_log_id', v_delete_log_id);
end;
$$;

revoke all on function public.maestro_delete_project_scoped(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_delete_project_scoped(uuid, text, text, text)
  to service_role;
