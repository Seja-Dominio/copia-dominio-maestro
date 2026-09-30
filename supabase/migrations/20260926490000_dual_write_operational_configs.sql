create or replace function public.maestro_sync_operational_config()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity not in ('DominusConversationState','DominusAuditSummary','SystemAuditLog','AppConfig','Squad') then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity=new.entity and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  if new.entity='DominusConversationState' then
    insert into public.maestro_conversation_states (legacy_record_id,organization_id,conversation_key,state_payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'conversation_id',new.payload->>'group_id',new.record_id),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,conversation_key=excluded.conversation_key,state_payload=excluded.state_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  elsif new.entity='DominusAuditSummary' then
    insert into public.maestro_audit_summaries (legacy_record_id,organization_id,summary,audit_payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'summary',new.payload->>'status',''),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,summary=excluded.summary,audit_payload=excluded.audit_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  elsif new.entity='SystemAuditLog' then
    insert into public.maestro_system_audit_logs (legacy_record_id,organization_id,action,actor_legacy_record_id,audit_payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'action',new.payload->>'event',''),nullif(new.payload->>'actor_id',''),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,action=excluded.action,actor_legacy_record_id=excluded.actor_legacy_record_id,audit_payload=excluded.audit_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  elsif new.entity='AppConfig' then
    insert into public.maestro_app_configs (legacy_record_id,organization_id,config_key,config_payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'key',new.payload->>'name',new.record_id),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,config_key=excluded.config_key,config_payload=excluded.config_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  else
    insert into public.maestro_squads (legacy_record_id,organization_id,name,squad_payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'name',''),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,name=excluded.name,squad_payload=excluded.squad_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists legacy_records_operational_config_sync on public.legacy_records;
create trigger legacy_records_operational_config_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_operational_config();
revoke execute on function public.maestro_sync_operational_config() from public,anon,authenticated;
