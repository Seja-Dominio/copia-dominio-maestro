-- Dual-write dos templates e documentos durante a migração progressiva.

create or replace function public.maestro_sync_template_document()
returns trigger language plpgsql set search_path = public as $$
declare v_org uuid;
begin
  if new.entity not in ('JobTemplate','Proposal','Note') then return new; end if;
  select organization_id into v_org from public.organization_legacy_records where legacy_entity=new.entity and legacy_record_id=new.record_id limit 1;
  if v_org is null then select id into v_org from public.organizations where status='active' order by created_at asc limit 1; end if;
  if v_org is null then return new; end if;
  if new.entity='JobTemplate' then
    insert into public.maestro_job_templates (legacy_record_id,organization_id,name,content_type,team,template_payload,source_updated_at)
    values (new.record_id,v_org,coalesce(new.payload->>'name',''),coalesce(new.payload->>'content_type',''),coalesce(new.payload->>'team',''),new.payload,new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,name=excluded.name,content_type=excluded.content_type,team=excluded.team,template_payload=excluded.template_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  elsif new.entity='Proposal' then
    insert into public.maestro_proposals (legacy_record_id,organization_id,title,client_legacy_record_id,status,proposal_payload,source_updated_at)
    values (new.record_id,v_org,coalesce(new.payload->>'title',new.payload->>'name',''),nullif(new.payload->>'client_id',''),coalesce(new.payload->>'status',''),new.payload,new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,title=excluded.title,client_legacy_record_id=excluded.client_legacy_record_id,status=excluded.status,proposal_payload=excluded.proposal_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  else
    insert into public.maestro_notes (legacy_record_id,organization_id,title,note_text,note_payload,source_updated_at)
    values (new.record_id,v_org,coalesce(new.payload->>'title',new.payload->>'name',''),coalesce(new.payload->>'content',new.payload->>'text',new.payload->>'description',''),new.payload,new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id,title=excluded.title,note_text=excluded.note_text,note_payload=excluded.note_payload,source_updated_at=excluded.source_updated_at,updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists legacy_records_template_document_sync on public.legacy_records;
create trigger legacy_records_template_document_sync
after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records
for each row execute function public.maestro_sync_template_document();
revoke execute on function public.maestro_sync_template_document() from public,anon,authenticated;
