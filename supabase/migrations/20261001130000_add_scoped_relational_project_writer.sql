-- Canonical Project mutations follow the registry cutover mode instead of
-- recreating legacy_records rows after the relational write freeze.
create or replace function public.maestro_upsert_project_scoped(
  p_organization_id uuid,
  p_action text,
  p_record_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before jsonb;
  v_payload jsonb;
  v_client_legacy_id text;
  v_client_id uuid;
  v_schedule jsonb;
  v_patch jsonb;
  v_date text;
  v_posts jsonb;
  v_exists boolean;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_organization_id is null or nullif(pg_catalog.btrim(p_record_id), '') is null
    or p_action not in ('create', 'update')
    or pg_catalog.jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid relational project mutation';
  end if;
  if not exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status = 'active'
  ) then raise exception 'project organization is not active'; end if;
  if not exists (
    select 1 from public.legacy_cutover_registry r
    where r.entity = 'Project' and r.status = 'frozen'
      and r.write_mode = 'relational' and not r.legacy_write_allowed
  ) then raise exception 'Project relational write cutover is not active'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_record_id, 0));
  if exists (
    select 1 from public.maestro_projects p
    where p.legacy_record_id = p_record_id and p.organization_id <> p_organization_id
  ) or exists (
    select 1 from public.legacy_records l
    where l.entity = 'Project' and l.record_id = p_record_id
      and l.organization_id is distinct from p_organization_id
  ) or exists (
    select 1 from public.organization_legacy_records s
    where s.legacy_entity = 'Project' and s.legacy_record_id = p_record_id
      and s.organization_id <> p_organization_id
  ) then raise exception 'project ID belongs to another organization'; end if;

  select p.source_payload into v_before
  from public.maestro_projects p
  where p.organization_id = p_organization_id and p.legacy_record_id = p_record_id
  for update;
  v_exists := found;
  if p_action = 'create' and v_exists then raise exception 'project already exists'; end if;
  if p_action = 'update' and not v_exists then raise exception 'project not found in organization'; end if;
  v_payload := case when v_exists then coalesce(v_before, '{}'::jsonb) else '{}'::jsonb end
    || coalesce(p_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object('id', p_record_id);

  if v_payload ? 'schedule_patch' then
    v_patch := v_payload -> 'schedule_patch';
    if pg_catalog.jsonb_typeof(v_patch) <> 'object' then raise exception 'project schedule patch must be an object'; end if;
    v_schedule := coalesce(v_before -> 'schedule_data', '{}'::jsonb);
    for v_date, v_posts in select key, value from pg_catalog.jsonb_each(v_patch) loop
      if v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or (v_posts <> 'null'::jsonb and pg_catalog.jsonb_typeof(v_posts) <> 'array') then
        raise exception 'invalid project schedule day';
      end if;
      if v_posts = 'null'::jsonb then v_schedule := v_schedule - v_date;
      else v_schedule := pg_catalog.jsonb_set(v_schedule, array[v_date], v_posts, true); end if;
    end loop;
    v_payload := (v_payload - 'schedule_patch') || pg_catalog.jsonb_build_object('schedule_data', v_schedule);
  end if;

  v_client_legacy_id := nullif(v_payload ->> 'client_id', '');
  if v_client_legacy_id is not null then
    select c.id into v_client_id
    from public.maestro_clients c
    where c.organization_id = p_organization_id and c.legacy_record_id = v_client_legacy_id;
    if v_client_id is null then raise exception 'project client must belong to the same organization'; end if;
  end if;

  insert into public.maestro_projects (
    organization_id, legacy_record_id, client_legacy_record_id, client_id,
    name, status, reference_month, source_payload, updated_at
  ) values (
    p_organization_id, p_record_id, v_client_legacy_id, v_client_id,
    coalesce(nullif(v_payload ->> 'name', ''), 'Projeto sem nome'),
    nullif(v_payload ->> 'status', ''), nullif(v_payload ->> 'reference_month', ''),
    v_payload, v_now
  ) on conflict (organization_id, legacy_record_id) do update set
    client_legacy_record_id = excluded.client_legacy_record_id,
    client_id = excluded.client_id,
    name = excluded.name,
    status = excluded.status,
    reference_month = excluded.reference_month,
    source_payload = excluded.source_payload,
    updated_at = excluded.updated_at;

  return v_payload;
end;
$$;

revoke all on function public.maestro_upsert_project_scoped(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.maestro_upsert_project_scoped(uuid, text, text, jsonb)
  to service_role;
