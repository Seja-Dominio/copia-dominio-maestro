create or replace function public.maestro_sync_relational_notification()
returns trigger language plpgsql set search_path = public
as $$
declare v_organization_id uuid; v_second_organization uuid;
begin
  if new.entity <> 'Notification' then return new; end if;
  select id into v_organization_id from public.organizations where status='active' order by created_at asc limit 1;
  select id into v_second_organization from public.organizations where status='active' and id <> v_organization_id limit 1;
  if v_organization_id is null or v_second_organization is not null then return new; end if;
  insert into public.organization_legacy_records (organization_id,legacy_entity,legacy_record_id,scope_status,source)
  values (v_organization_id,new.entity,new.record_id,'confirmed','single-organization-trigger') on conflict (organization_id,legacy_entity,legacy_record_id) do nothing;
  insert into public.maestro_notifications (organization_id,legacy_record_id,user_id,type,title,message,is_read,entity_type,entity_id,source_payload,updated_at)
  values (v_organization_id,new.record_id,new.payload ->> 'user_id',new.payload ->> 'type',coalesce(nullif(new.payload ->> 'title',''),'Notificação'),new.payload ->> 'message',case when new.payload ? 'is_read' then (new.payload ->> 'is_read')::boolean else false end,new.payload ->> 'entity_type',new.payload ->> 'entity_id',new.payload,coalesce(new.source_updated_at,now()))
  on conflict (organization_id,legacy_record_id) do update set user_id=excluded.user_id,type=excluded.type,title=excluded.title,message=excluded.message,is_read=excluded.is_read,entity_type=excluded.entity_type,entity_id=excluded.entity_id,source_payload=excluded.source_payload,updated_at=excluded.updated_at;
  return new;
end; $$;
drop trigger if exists legacy_records_relational_notification_sync on public.legacy_records;
create trigger legacy_records_relational_notification_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_relational_notification();
revoke execute on function public.maestro_sync_relational_notification() from public,anon,authenticated;
