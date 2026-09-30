create or replace function public.maestro_sync_relational_timesheet()
returns trigger language plpgsql set search_path = public
as $$
declare v_organization_id uuid; v_second_organization uuid; v_job_id uuid;
begin
  if new.entity <> 'Timesheet' then return new; end if;
  select id into v_organization_id from public.organizations where status='active' order by created_at asc limit 1;
  select id into v_second_organization from public.organizations where status='active' and id <> v_organization_id limit 1;
  if v_organization_id is null or v_second_organization is not null then return new; end if;
  select j.id into v_job_id from public.maestro_jobs j where j.organization_id=v_organization_id and j.legacy_record_id=new.payload ->> 'job_id';
  insert into public.organization_legacy_records (organization_id,legacy_entity,legacy_record_id,scope_status,source)
  values (v_organization_id,new.entity,new.record_id,'confirmed','single-organization-trigger') on conflict (organization_id,legacy_entity,legacy_record_id) do nothing;
  insert into public.maestro_timesheets (organization_id,legacy_record_id,legacy_job_record_id,job_id,client_legacy_record_id,project_legacy_record_id,collaborator_id,collaborator_name,job_title,status,is_running,is_rework,started_at,ended_at,duration_minutes,notes,source_payload,updated_at)
  values (v_organization_id,new.record_id,new.payload ->> 'job_id',v_job_id,new.payload ->> 'client_id',new.payload ->> 'project_id',new.payload ->> 'collaborator_id',new.payload ->> 'collaborator_name',new.payload ->> 'job_title',new.payload ->> 'status',case when new.payload ? 'is_running' then (new.payload ->> 'is_running')::boolean else null end,case when new.payload ? 'is_rework' then (new.payload ->> 'is_rework')::boolean else null end,case when new.payload ->> 'started_at' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'started_at')::timestamptz else null end,case when new.payload ->> 'ended_at' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'ended_at')::timestamptz else null end,case when new.payload ->> 'duration_minutes' ~ '^\\d+$' then (new.payload ->> 'duration_minutes')::integer else null end,new.payload ->> 'notes',new.payload,coalesce(new.source_updated_at,now()))
  on conflict (organization_id,legacy_record_id) do update set legacy_job_record_id=excluded.legacy_job_record_id,job_id=excluded.job_id,client_legacy_record_id=excluded.client_legacy_record_id,project_legacy_record_id=excluded.project_legacy_record_id,collaborator_id=excluded.collaborator_id,collaborator_name=excluded.collaborator_name,job_title=excluded.job_title,status=excluded.status,is_running=excluded.is_running,is_rework=excluded.is_rework,started_at=excluded.started_at,ended_at=excluded.ended_at,duration_minutes=excluded.duration_minutes,notes=excluded.notes,source_payload=excluded.source_payload,updated_at=excluded.updated_at;
  return new;
end; $$;
drop trigger if exists legacy_records_relational_timesheet_sync on public.legacy_records;
create trigger legacy_records_relational_timesheet_sync after insert or update of entity,record_id,payload,source_updated_at on public.legacy_records for each row execute function public.maestro_sync_relational_timesheet();
revoke execute on function public.maestro_sync_relational_timesheet() from public,anon,authenticated;
