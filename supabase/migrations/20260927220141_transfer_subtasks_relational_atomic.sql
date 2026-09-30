create or replace function public.maestro_transfer_subtasks(
  p_organization_id uuid,
  p_source_collaborator_id text,
  p_target_collaborator_id text,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_target_name text;
  v_updated_ids jsonb;
  v_now timestamptz := pg_catalog.now();
begin
  if p_organization_id is null
    or nullif(pg_catalog.btrim(p_source_collaborator_id), '') is null
    or nullif(pg_catalog.btrim(p_target_collaborator_id), '') is null
    or p_source_collaborator_id = p_target_collaborator_id then
    raise exception 'source and target collaborators must be different and organization is required';
  end if;

  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status = 'active'
  ) then
    raise exception 'organization is not active';
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.collaborator_id = p_actor_id
      and m.status = 'active'
  ) then
    raise exception 'actor is not an active member of the organization';
  end if;

  select coalesce(
    nullif(pg_catalog.btrim(c.profile ->> 'name'), ''),
    nullif(pg_catalog.btrim(c.profile ->> 'full_name'), ''),
    c.login,
    c.id
  )
  into v_target_name
  from public.organization_members m
  join public.maestro_collaborators c on c.id = m.collaborator_id
  where m.organization_id = p_organization_id
    and m.collaborator_id = p_target_collaborator_id
    and m.status = 'active'
    and c.is_active
  limit 1;

  if v_target_name is null then
    raise exception 'target collaborator is not active in the organization';
  end if;

  with eligible as materialized (
    select t.legacy_record_id, t.legacy_job_record_id, t.job_id,
      t.title, t.responsible_id, t.source_payload
    from public.maestro_job_tasks t
    where t.organization_id = p_organization_id
      and t.responsible_id = p_source_collaborator_id
      and t.is_completed is distinct from true
      and lower(btrim(coalesce(t.status, 'pending'))) <> 'completed'
    order by t.legacy_record_id
    limit 10000
    for update
  ), updated as (
    update public.maestro_job_tasks t
    set responsible_id = p_target_collaborator_id,
        responsible_name = v_target_name,
        source_payload = pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              coalesce(t.source_payload, '{}'::jsonb),
              '{responsible_id}', pg_catalog.to_jsonb(p_target_collaborator_id), true
            ),
            '{responsible_name}', pg_catalog.to_jsonb(v_target_name), true
          ),
          '{updated_date}', pg_catalog.to_jsonb(v_now), true
        ),
        updated_at = v_now
    from eligible e
    where t.organization_id = p_organization_id
      and t.legacy_record_id = e.legacy_record_id
    returning t.legacy_record_id, t.legacy_job_record_id, t.job_id,
      t.title, e.responsible_id as previous_responsible_id
  ), history as (
    insert into public.maestro_job_history (
      organization_id, legacy_record_id, job_legacy_id, job_id,
      collaborator_legacy_id, event_type, field_name, old_value, new_value,
      message, source_payload, occurred_at
    )
    select p_organization_id,
      pg_catalog.gen_random_uuid()::text,
      u.legacy_job_record_id,
      u.job_id,
      p_actor_id,
      'subtask',
      'responsible_id',
      u.previous_responsible_id,
      p_target_collaborator_id,
      pg_catalog.format('Tarefa "%s" transferida para %s', u.title, v_target_name),
      pg_catalog.jsonb_build_object(
        'entity', 'Subtask',
        'record_id', u.legacy_record_id,
        'action', 'transfer',
        'actor_id', p_actor_id,
        'actor_name', pg_catalog.left(coalesce(p_actor_name, ''), 120),
        'field', 'responsible_id',
        'target_id', p_target_collaborator_id,
        'target_name', v_target_name
      ),
      v_now
    from updated u
    returning legacy_record_id
  )
  select coalesce(pg_catalog.jsonb_agg(u.legacy_record_id order by u.legacy_record_id), '[]'::jsonb)
  into v_updated_ids
  from updated u;

  return pg_catalog.jsonb_build_object(
    'updatedCount', pg_catalog.jsonb_array_length(v_updated_ids),
    'updatedIds', v_updated_ids,
    'targetName', v_target_name
  );
end;
$$;

revoke all on function public.maestro_transfer_subtasks(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_transfer_subtasks(uuid, text, text, text, text)
  to service_role;
