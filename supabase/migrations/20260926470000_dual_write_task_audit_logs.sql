create or replace function public.maestro_sync_task_audit_log()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity not in ('MiniTask','DeleteLog') then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity=new.entity and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  if new.entity='MiniTask' then
    insert into public.maestro_mini_tasks (legacy_record_id,organization_id,title,collaborator_legacy_record_id,collaborator_id,due_date,due_time,priority,is_completed,task_payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'title',''),nullif(new.payload->>'collaborator_id',''),(select m.collaborator_id from public.organization_members m where m.organization_id=v_org and m.collaborator_id=nullif(new.payload->>'collaborator_id','')),case when new.payload->>'due_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload->>'due_date')::date else null end,nullif(new.payload->>'due_time',''),coalesce((new.payload->>'priority')::integer,0),coalesce((new.payload->>'is_completed')::boolean,false),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,title=excluded.title,collaborator_legacy_record_id=excluded.collaborator_legacy_record_id,collaborator_id=excluded.collaborator_id,due_date=excluded.due_date,due_time=excluded.due_time,priority=excluded.priority,is_completed=excluded.is_completed,task_payload=excluded.task_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  else
    insert into public.maestro_delete_logs (legacy_record_id,organization_id,entity_type,deleted_entity_legacy_record_id,deleted_by_legacy_record_id,reason,deleted_at,is_restored,deleted_payload,payload,source_updated_at) values (new.record_id,v_org,coalesce(new.payload->>'entity_type',''),nullif(new.payload->>'entity_id',''),nullif(new.payload->>'deleted_by',''),coalesce(new.payload->>'reason',''),case when new.payload->>'deleted_at' <> '' then (new.payload->>'deleted_at')::timestamptz else null end,coalesce((new.payload->>'is_restored')::boolean,false),coalesce(new.payload->'entity_data','{}'::jsonb),new.payload,new.source_updated_at) on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,entity_type=excluded.entity_type,deleted_entity_legacy_record_id=excluded.deleted_entity_legacy_record_id,deleted_by_legacy_record_id=excluded.deleted_by_legacy_record_id,reason=excluded.reason,deleted_at=excluded.deleted_at,is_restored=excluded.is_restored,deleted_payload=excluded.deleted_payload,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists legacy_records_task_audit_sync on public.legacy_records;
create trigger legacy_records_task_audit_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_task_audit_log();
revoke execute on function public.maestro_sync_task_audit_log() from public,anon,authenticated;
