-- Serialize CXM appointment writes per organization and assigned collaborator
-- so concurrent requests cannot reserve overlapping slots.
create or replace function public.save_cxm_appointment_if_available(
  p_organization_id uuid,
  p_record_id text,
  p_payload jsonb,
  p_expected_starts_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_row public.legacy_records%rowtype;
  start_at timestamptz;
  end_at timestamptz;
  collaborator_id text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_organization_id is null or nullif(p_record_id, '') is null
    or p_payload->>'id' <> p_record_id
    or p_payload->>'scope_type' <> 'client'
    or nullif(p_payload->>'client_id', '') is null
    or nullif(p_payload->>'assigned_to', '') is null
    or p_payload->>'status' not in ('requested', 'confirmed') then
    raise exception 'invalid appointment reservation';
  end if;

  start_at := (p_payload->>'starts_at')::timestamptz;
  end_at := (p_payload->>'ends_at')::timestamptz;
  collaborator_id := p_payload->>'assigned_to';
  if end_at <= start_at then raise exception 'invalid appointment interval'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || collaborator_id, 0));

  select * into appointment_row
  from public.legacy_records
  where organization_id = p_organization_id
    and entity = 'CXMClientAppointment'
    and record_id = p_record_id
  for update;

  if p_expected_starts_at is null and found then
    return jsonb_build_object('status', 'duplicate', 'payload', appointment_row.payload);
  end if;
  if p_expected_starts_at is not null and not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_expected_starts_at is not null
    and (appointment_row.payload->>'starts_at')::timestamptz <> p_expected_starts_at then
    return jsonb_build_object('status', 'stale');
  end if;

  if exists (
    select 1
    from public.legacy_records other_appointment
    where other_appointment.organization_id = p_organization_id
      and other_appointment.entity = 'CXMClientAppointment'
      and other_appointment.record_id <> p_record_id
      and other_appointment.payload->>'assigned_to' = collaborator_id
      and other_appointment.payload->>'status' in ('requested', 'confirmed')
      and (other_appointment.payload->>'starts_at')::timestamptz < end_at
      and (other_appointment.payload->>'ends_at')::timestamptz > start_at
  ) then
    return jsonb_build_object('status', 'schedule_conflict');
  end if;

  if p_expected_starts_at is null then
    insert into public.legacy_records (entity, record_id, organization_id, payload, source_created_at, source_updated_at)
    values ('CXMClientAppointment', p_record_id, p_organization_id, p_payload, now(), now())
    on conflict (entity, record_id) do nothing;
    if not found then
      select * into appointment_row
      from public.legacy_records
      where entity = 'CXMClientAppointment' and record_id = p_record_id;
      return jsonb_build_object('status', 'duplicate', 'payload', appointment_row.payload);
    end if;
  else
    update public.legacy_records
    set payload = p_payload, source_updated_at = now()
    where organization_id = p_organization_id
      and entity = 'CXMClientAppointment'
      and record_id = p_record_id;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
  end if;

  return jsonb_build_object('status', 'saved', 'payload', p_payload);
end;
$$;

revoke all on function public.save_cxm_appointment_if_available(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_cxm_appointment_if_available(uuid, text, jsonb, timestamptz) to service_role;
