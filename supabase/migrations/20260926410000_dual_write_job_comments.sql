create or replace function public.maestro_sync_job_comment()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity <> 'Comment' or coalesce(new.payload->>'entity_type','job') <> 'job' then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity='Comment' and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  insert into public.maestro_job_comments (legacy_record_id,organization_id,job_legacy_record_id,author_legacy_record_id,content,mentions,payload,source_updated_at)
  values (new.record_id,v_org,nullif(new.payload->>'entity_id',''),nullif(new.payload->>'created_by_id',''),coalesce(new.payload->>'content',''),case when jsonb_typeof(new.payload->'mentions')='array' then new.payload->'mentions' else '[]'::jsonb end,new.payload,new.source_updated_at)
  on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,job_legacy_record_id=excluded.job_legacy_record_id,author_legacy_record_id=excluded.author_legacy_record_id,content=excluded.content,mentions=excluded.mentions,payload=excluded.payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  return new;
end;
$$;
drop trigger if exists legacy_records_job_comment_sync on public.legacy_records;
create trigger legacy_records_job_comment_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_job_comment();
revoke execute on function public.maestro_sync_job_comment() from public,anon,authenticated;
