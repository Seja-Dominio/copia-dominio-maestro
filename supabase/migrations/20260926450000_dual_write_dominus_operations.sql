create or replace function public.maestro_sync_dominus_operation()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity not in ('DominusQueryLog','DominusSentMessage','DominusPendingMessage') then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity=new.entity and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  if new.entity='DominusQueryLog' then
    insert into public.maestro_dominus_query_logs (legacy_record_id,organization_id,query_text,status,payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'query',new.payload->>'question',''),coalesce(new.payload->>'status',''),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,query_text=excluded.query_text,status=excluded.status,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  elsif new.entity='DominusSentMessage' then
    insert into public.maestro_dominus_sent_messages (legacy_record_id,organization_id,group_id,message_text,status,payload,source_updated_at) values (new.record_id,v_org,nullif(new.payload->>'group_id',''),coalesce(new.payload->>'message',new.payload->>'text',''),coalesce(new.payload->>'status',''),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,group_id=excluded.group_id,message_text=excluded.message_text,status=excluded.status,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  else
    insert into public.maestro_dominus_pending_messages (legacy_record_id,organization_id,message_id,group_id,question,status,payload,source_updated_at) values (new.record_id,v_org,nullif(new.payload->>'message_id',''),nullif(new.payload->>'group_id',''),coalesce(new.payload->>'question',''),coalesce(new.payload->>'status',''),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,message_id=excluded.message_id,group_id=excluded.group_id,question=excluded.question,status=excluded.status,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists legacy_records_dominus_operation_sync on public.legacy_records;
create trigger legacy_records_dominus_operation_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_dominus_operation();
revoke execute on function public.maestro_sync_dominus_operation() from public,anon,authenticated;
