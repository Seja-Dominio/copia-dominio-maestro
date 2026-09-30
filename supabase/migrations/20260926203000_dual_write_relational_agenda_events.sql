create or replace function public.maestro_sync_relational_agenda_event()
returns trigger language plpgsql set search_path = public
as $$
declare v_organization_id uuid; v_second_organization uuid;
begin
  if new.entity <> 'AgendaEvent' then return new; end if;
  select id into v_organization_id from public.organizations where status='active' order by created_at asc limit 1;
  select id into v_second_organization from public.organizations where status='active' and id <> v_organization_id limit 1;
  if v_organization_id is null or v_second_organization is not null then return new; end if;
  insert into public.organization_legacy_records (organization_id, legacy_entity, legacy_record_id, scope_status, source)
  values (v_organization_id, new.entity, new.record_id, 'confirmed', 'single-organization-trigger')
  on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;
  insert into public.maestro_agenda_events (organization_id, legacy_record_id, client_legacy_record_id, title, event_date, start_time, end_time, status, activity_type, collaborator_id, collaborator_name, notes, source_payload, updated_at)
  values (v_organization_id, new.record_id, new.payload ->> 'client_id', coalesce(nullif(new.payload ->> 'title',''),'Evento sem título'), case when new.payload ->> 'date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'date')::date else null end, case when new.payload ->> 'time' ~ '^\\d{2}:\\d{2}' then (new.payload ->> 'time')::time else null end, case when new.payload ->> 'end_time' ~ '^\\d{2}:\\d{2}' then (new.payload ->> 'end_time')::time else null end, new.payload ->> 'status', new.payload ->> 'activity_type', new.payload ->> 'collaborator_id', new.payload ->> 'collaborator_name', new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at,now()))
  on conflict (organization_id, legacy_record_id) do update set client_legacy_record_id=excluded.client_legacy_record_id, title=excluded.title, event_date=excluded.event_date, start_time=excluded.start_time, end_time=excluded.end_time, status=excluded.status, activity_type=excluded.activity_type, collaborator_id=excluded.collaborator_id, collaborator_name=excluded.collaborator_name, notes=excluded.notes, source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  return new;
end; $$;
drop trigger if exists legacy_records_relational_agenda_event_sync on public.legacy_records;
create trigger legacy_records_relational_agenda_event_sync after insert or update of entity, record_id, payload, source_updated_at on public.legacy_records for each row execute function public.maestro_sync_relational_agenda_event();
revoke execute on function public.maestro_sync_relational_agenda_event() from public, anon, authenticated;
