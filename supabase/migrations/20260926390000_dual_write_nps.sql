-- Dual-write de NPS durante a migração progressiva.

create or replace function public.maestro_sync_nps()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity not in ('NpsEntry','NpsHistory') then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity=new.entity and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  if new.entity='NpsEntry' then
    insert into public.maestro_nps_entries (legacy_record_id,organization_id,client_legacy_record_id,month,monthly_score,notes,recorded_by,payload,source_updated_at)
    values (new.record_id,v_org,nullif(new.payload->>'client_id',''),case when new.payload->>'month' ~ '^\\d{4}-\\d{2}' then (new.payload->>'month')::date else null end,case when new.payload->>'monthly_score' ~ '^-?\\d+$' then (new.payload->>'monthly_score')::integer else null end,coalesce(new.payload->>'notes',''),coalesce(new.payload->>'recorded_by',''),new.payload,new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,client_legacy_record_id=excluded.client_legacy_record_id,month=excluded.month,monthly_score=excluded.monthly_score,notes=excluded.notes,recorded_by=excluded.recorded_by,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  else
    insert into public.maestro_nps_history (legacy_record_id,organization_id,client_legacy_record_id,job_legacy_record_id,event_type,delta,score_before,score_after,description,payload,source_updated_at)
    values (new.record_id,v_org,nullif(new.payload->>'client_id',''),nullif(new.payload->>'job_id',''),coalesce(new.payload->>'event_type',''),case when new.payload->>'delta' ~ '^-?\\d+$' then (new.payload->>'delta')::integer else null end,case when new.payload->>'score_before' ~ '^-?\\d+$' then (new.payload->>'score_before')::integer else null end,case when new.payload->>'score_after' ~ '^-?\\d+$' then (new.payload->>'score_after')::integer else null end,coalesce(new.payload->>'description',''),new.payload,new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,client_legacy_record_id=excluded.client_legacy_record_id,job_legacy_record_id=excluded.job_legacy_record_id,event_type=excluded.event_type,delta=excluded.delta,score_before=excluded.score_before,score_after=excluded.score_after,description=excluded.description,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists legacy_records_nps_sync on public.legacy_records;
create trigger legacy_records_nps_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_nps();
revoke execute on function public.maestro_sync_nps() from public,anon,authenticated;
