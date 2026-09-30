create or replace function public.maestro_delete_timesheets_with_audit(
  p_organization_id uuid,
  p_record_ids text[],
  p_actor_id text,
  p_actor_name text,
  p_reason text
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_deleted_count bigint;
begin
  if p_organization_id is null or nullif(btrim(p_actor_id), '') is null then
    raise exception 'Escopo ou autor inválido.';
  end if;

  with deleted_timesheets as (
    delete from public.legacy_records as timesheet
    where timesheet.entity = 'Timesheet'
      and timesheet.organization_id = p_organization_id
      and (p_record_ids is null or timesheet.record_id = any(p_record_ids))
    returning timesheet.record_id, timesheet.payload
  ), inserted_audit as (
    insert into public.legacy_records (
      organization_id,
      entity,
      record_id,
      payload,
      source_created_at,
      source_updated_at
    )
    select
      p_organization_id,
      'DeleteLog',
      replace(pg_catalog.gen_random_uuid()::text, '-', ''),
      pg_catalog.jsonb_build_object(
        'entity_type', 'timesheet',
        'entity_id', deleted_timesheets.record_id,
        'entity_data', coalesce(deleted_timesheets.payload, '{}'::jsonb) || pg_catalog.jsonb_build_object('id', deleted_timesheets.record_id),
        'deleted_by', p_actor_id,
        'deleted_by_name', coalesce(nullif(p_actor_name, ''), 'Master'),
        'deleted_at', pg_catalog.now(),
        'reason', coalesce(p_reason, ''),
        'is_restored', false
      ),
      pg_catalog.now(),
      pg_catalog.now()
    from deleted_timesheets
    returning record_id
  )
  select count(*) into v_deleted_count from inserted_audit;

  return v_deleted_count;
end;
$$;

revoke all on function public.maestro_delete_timesheets_with_audit(uuid, text[], text, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_delete_timesheets_with_audit(uuid, text[], text, text, text)
  to service_role;
