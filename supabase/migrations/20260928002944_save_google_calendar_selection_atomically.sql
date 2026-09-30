create or replace function public.save_google_calendar_selection(
  p_organization_id uuid,
  p_calendars jsonb,
  p_default_calendar_id text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total bigint;
  v_distinct_ids bigint;
  v_has_default boolean;
  v_invalid_rows bigint;
begin
  if p_organization_id is null
    or p_calendars is null
    or jsonb_typeof(p_calendars) <> 'array'
    or nullif(btrim(p_default_calendar_id), '') is null then
    raise exception 'Seleção de calendários inválida.';
  end if;

  select
    count(*),
    count(distinct nullif(btrim(item.calendar_id), '')),
    coalesce(bool_or(item.calendar_id = p_default_calendar_id), false),
    count(*) filter (
      where nullif(btrim(item.calendar_id), '') is null
        or item.calendar_id <> btrim(item.calendar_id)
        or coalesce(item.access_role, '') not in ('owner', 'writer')
    )
  into v_total, v_distinct_ids, v_has_default, v_invalid_rows
  from jsonb_to_recordset(p_calendars) as item(
    calendar_id text,
    calendar_name text,
    access_role text
  );

  if v_total = 0 or v_total <> v_distinct_ids or v_invalid_rows > 0 or not v_has_default then
    raise exception 'Seleção de calendários inválida.';
  end if;

  -- Lock and verify the organization connection before touching any selection rows.
  perform 1
  from public.maestro_google_calendar_connections as connection
  where connection.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Integração do Google Agenda não encontrada para a organização.';
  end if;

  update public.maestro_google_calendar_calendars
  set is_selected = false,
      is_default = false,
      updated_at = now()
  where organization_id = p_organization_id;

  insert into public.maestro_google_calendar_calendars (
    organization_id,
    calendar_id,
    calendar_name,
    access_role,
    is_selected,
    is_default,
    updated_at
  )
  select
    p_organization_id,
    item.calendar_id,
    coalesce(nullif(item.calendar_name, ''), item.calendar_id),
    item.access_role,
    true,
    item.calendar_id = p_default_calendar_id,
    now()
  from jsonb_to_recordset(p_calendars) as item(
    calendar_id text,
    calendar_name text,
    access_role text
  )
  on conflict (organization_id, calendar_id) do update
  set calendar_name = excluded.calendar_name,
      access_role = excluded.access_role,
      is_selected = true,
      is_default = excluded.is_default,
      updated_at = now();

  update public.maestro_google_calendar_connections as connection
  set calendar_id = selected.calendar_id,
      calendar_name = coalesce(nullif(selected.calendar_name, ''), selected.calendar_id),
      updated_at = now()
  from jsonb_to_recordset(p_calendars) as selected(
    calendar_id text,
    calendar_name text,
    access_role text
  )
  where connection.organization_id = p_organization_id
    and selected.calendar_id = p_default_calendar_id;

  if not found then
    raise exception 'Calendário padrão não encontrado na seleção.';
  end if;
end;
$$;

revoke all on function public.save_google_calendar_selection(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_google_calendar_selection(uuid, jsonb, text) to service_role;
