create or replace function public.maestro_sync_webhook_parsed()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity <> 'DominusWebhookParsed' then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity=new.entity and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  insert into public.maestro_webhook_parsed_messages (legacy_record_id,organization_id,message_id,group_id,text_content,from_me,media_kind,media_failed,sender_jids,payload,source_updated_at)
  values (new.record_id,v_org,coalesce(new.payload->>'message_id',''),nullif(new.payload->>'group_id',''),coalesce(new.payload->>'text',''),coalesce((new.payload->>'from_me')::boolean,false),nullif(new.payload->>'media_kind',''),coalesce((new.payload->>'media_failed')::boolean,false),case when jsonb_typeof(new.payload->'sender_jids')='array' then new.payload->'sender_jids' else '[]'::jsonb end,new.payload,new.source_updated_at)
  on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,message_id=excluded.message_id,group_id=excluded.group_id,text_content=excluded.text_content,from_me=excluded.from_me,media_kind=excluded.media_kind,media_failed=excluded.media_failed,sender_jids=excluded.sender_jids,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  return new;
end;
$$;
drop trigger if exists legacy_records_webhook_parsed_sync on public.legacy_records;
create trigger legacy_records_webhook_parsed_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_webhook_parsed();
revoke execute on function public.maestro_sync_webhook_parsed() from public,anon,authenticated;
