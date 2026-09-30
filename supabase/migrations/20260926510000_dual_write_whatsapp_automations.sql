create or replace function public.maestro_sync_whatsapp_automation()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity <> 'WhatsappAutomation' then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity=new.entity and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  insert into public.maestro_whatsapp_automations (legacy_record_id,organization_id,kind,name,active,group_id,schedule_time,frequency,automation_payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'kind',''),coalesce(new.payload->>'name',''),coalesce((new.payload->>'active')::boolean,true),nullif(new.payload->>'group_id',''),nullif(new.payload->>'schedule_time',''),coalesce(new.payload->>'frequency',''),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,kind=excluded.kind,name=excluded.name,active=excluded.active,group_id=excluded.group_id,schedule_time=excluded.schedule_time,frequency=excluded.frequency,automation_payload=excluded.automation_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  return new;
end;
$$;
drop trigger if exists legacy_records_whatsapp_automation_sync on public.legacy_records;
create trigger legacy_records_whatsapp_automation_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_whatsapp_automation();
revoke execute on function public.maestro_sync_whatsapp_automation() from public,anon,authenticated;
