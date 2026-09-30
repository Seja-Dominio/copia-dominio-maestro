-- Keep administrative Timesheet operations aligned with the relational source
-- of truth. The legacy registry controls whether reset also updates legacy rows.
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
  v_row record;
  v_legacy_payload jsonb;
  v_snapshot jsonb;
  v_deleted_count bigint := 0;
begin
  if p_organization_id is null or nullif(btrim(p_actor_id), '') is null then
    raise exception 'Escopo ou autor inválido.';
  end if;

  -- First remove rows with a relational projection, keeping its payload as a
  -- fallback snapshot if a legacy mirror is already absent.
  for v_row in
    select t.legacy_record_id, t.source_payload
    from public.maestro_timesheets t
    where t.organization_id = p_organization_id
      and (p_record_ids is null or t.legacy_record_id = any(p_record_ids))
    order by t.legacy_record_id
    for update
  loop
    v_legacy_payload := null;
    select l.payload into v_legacy_payload
    from public.legacy_records l
    where l.entity = 'Timesheet' and l.organization_id = p_organization_id
      and l.record_id = v_row.legacy_record_id
    for update;

    v_snapshot := coalesce(v_legacy_payload, v_row.source_payload, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('id', v_row.legacy_record_id);

    delete from public.legacy_records l
    where l.entity = 'Timesheet' and l.organization_id = p_organization_id
      and l.record_id = v_row.legacy_record_id;
    delete from public.maestro_timesheets t
    where t.organization_id = p_organization_id and t.legacy_record_id = v_row.legacy_record_id;

    insert into public.legacy_records (
      organization_id, entity, record_id, payload, source_created_at, source_updated_at
    ) values (
      p_organization_id, 'DeleteLog', replace(pg_catalog.gen_random_uuid()::text, '-', ''),
      pg_catalog.jsonb_build_object(
        'entity_type', 'timesheet', 'entity_id', v_row.legacy_record_id,
        'entity_data', v_snapshot, 'deleted_by', p_actor_id,
        'deleted_by_name', coalesce(nullif(p_actor_name, ''), 'Master'),
        'deleted_at', pg_catalog.now(), 'reason', coalesce(p_reason, ''), 'is_restored', false
      ), pg_catalog.now(), pg_catalog.now()
    );
    v_deleted_count := v_deleted_count + 1;
  end loop;

  -- Preserve and audit legacy-only rows too; this can occur during migration.
  for v_row in
    select l.record_id, l.payload
    from public.legacy_records l
    where l.entity = 'Timesheet' and l.organization_id = p_organization_id
      and (p_record_ids is null or l.record_id = any(p_record_ids))
      and not exists (
        select 1 from public.maestro_timesheets t
        where t.organization_id = p_organization_id and t.legacy_record_id = l.record_id
      )
    order by l.record_id
    for update of l
  loop
    v_snapshot := coalesce(v_row.payload, '{}'::jsonb)
      || pg_catalog.jsonb_build_object('id', v_row.record_id);
    delete from public.legacy_records l
    where l.entity = 'Timesheet' and l.organization_id = p_organization_id
      and l.record_id = v_row.record_id;
    insert into public.legacy_records (
      organization_id, entity, record_id, payload, source_created_at, source_updated_at
    ) values (
      p_organization_id, 'DeleteLog', replace(pg_catalog.gen_random_uuid()::text, '-', ''),
      pg_catalog.jsonb_build_object(
        'entity_type', 'timesheet', 'entity_id', v_row.record_id,
        'entity_data', v_snapshot, 'deleted_by', p_actor_id,
        'deleted_by_name', coalesce(nullif(p_actor_name, ''), 'Master'),
        'deleted_at', pg_catalog.now(), 'reason', coalesce(p_reason, ''), 'is_restored', false
      ), pg_catalog.now(), pg_catalog.now()
    );
    v_deleted_count := v_deleted_count + 1;
  end loop;

  return v_deleted_count;
end;
$$;

revoke all on function public.maestro_delete_timesheets_with_audit(uuid, text[], text, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_delete_timesheets_with_audit(uuid, text[], text, text, text)
  to service_role;

create or replace function public.maestro_reset_running_timesheets(
  p_organization_id uuid
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_legacy_write_allowed boolean := true;
  v_relational_count bigint := 0;
  v_legacy_only_count bigint := 0;
begin
  if p_organization_id is null then
    raise exception 'Organização obrigatória.';
  end if;

  select coalesce(r.legacy_write_allowed, true) into v_legacy_write_allowed
  from (select 1) seed
  left join public.legacy_cutover_registry r on r.entity = 'Timesheet';

  select count(*) into v_legacy_only_count
  from public.legacy_records l
  where l.entity = 'Timesheet' and l.organization_id = p_organization_id
    and l.payload->>'is_running' = 'true'
    and not exists (
      select 1 from public.maestro_timesheets t
      where t.organization_id = p_organization_id and t.legacy_record_id = l.record_id
    );

  with running as (
    select t.legacy_record_id, t.started_at
    from public.maestro_timesheets t
    where t.organization_id = p_organization_id and t.is_running is true
    for update
  ), calculated as (
    select r.legacy_record_id,
      greatest(1, floor(extract(epoch from (v_now - coalesce(r.started_at, v_now))) / 60)::integer) as duration_minutes
    from running r
  ), changed as (
    update public.maestro_timesheets t
    set is_running = false,
        ended_at = v_now,
        duration_minutes = c.duration_minutes,
        source_payload = coalesce(t.source_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          'id', t.legacy_record_id, 'is_running', false,
          'ended_at', v_now, 'duration_minutes', c.duration_minutes
        ),
        updated_at = v_now
    from calculated c
    where t.organization_id = p_organization_id and t.legacy_record_id = c.legacy_record_id
    returning t.legacy_record_id
  )
  select count(*) into v_relational_count from changed;

  if v_legacy_write_allowed then
    update public.legacy_records l
    set payload = coalesce(l.payload, '{}'::jsonb) || pg_catalog.jsonb_build_object(
          'id', l.record_id, 'is_running', false,
          'ended_at', v_now,
          'duration_minutes', greatest(
            1,
            floor(extract(epoch from (v_now - coalesce(
              case when pg_catalog.pg_input_is_valid(l.payload->>'started_at', 'timestamp with time zone')
                then (l.payload->>'started_at')::timestamptz end,
              v_now
            ))) / 60)::integer
          )
        ),
        source_updated_at = v_now
    where l.entity = 'Timesheet' and l.organization_id = p_organization_id
      and l.payload->>'is_running' = 'true';
  end if;

  return v_relational_count + case when v_legacy_write_allowed then v_legacy_only_count else 0 end;
end;
$$;

revoke all on function public.maestro_reset_running_timesheets(uuid) from public, anon, authenticated;
grant execute on function public.maestro_reset_running_timesheets(uuid) to service_role;
