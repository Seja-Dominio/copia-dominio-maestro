-- Expand timesheets with typed relations while retaining the legacy IDs as
-- snapshots. Parent rows must match the same organization and legacy identity.
alter table public.maestro_timesheets
  add column client_id uuid,
  add column project_id uuid;

update public.maestro_timesheets t
set client_id = c.id
from public.maestro_clients c
where t.client_id is null
  and nullif(t.client_legacy_record_id, '') is not null
  and c.organization_id = t.organization_id
  and c.legacy_record_id = t.client_legacy_record_id;

update public.maestro_timesheets t
set project_id = p.id
from public.maestro_projects p
where t.project_id is null
  and nullif(t.project_legacy_record_id, '') is not null
  and p.organization_id = t.organization_id
  and p.legacy_record_id = t.project_legacy_record_id;

create index maestro_timesheets_org_client_identity_idx
  on public.maestro_timesheets (organization_id, client_id, client_legacy_record_id);
create index maestro_timesheets_org_project_identity_idx
  on public.maestro_timesheets (organization_id, project_id, project_legacy_record_id);

alter table public.maestro_timesheets
  add constraint maestro_timesheets_org_client_identity_fk
  foreign key (organization_id, client_id, client_legacy_record_id)
  references public.maestro_clients (organization_id, id, legacy_record_id)
  on delete set null (client_id) not valid,
  add constraint maestro_timesheets_org_project_identity_fk
  foreign key (organization_id, project_id, project_legacy_record_id)
  references public.maestro_projects (organization_id, id, legacy_record_id)
  on delete set null (project_id) not valid;

alter table public.maestro_timesheets
  validate constraint maestro_timesheets_org_client_identity_fk,
  validate constraint maestro_timesheets_org_project_identity_fk;

create or replace function public.maestro_sync_relational_timesheet()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
  v_job_id uuid;
  v_client_id uuid;
  v_project_id uuid;
begin
  if new.entity <> 'Timesheet' then return new; end if;

  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Timesheet organization mapping is ambiguous';
  end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Timesheet organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'Timesheet organization is not active';
  end if;

  select j.id into v_job_id
  from public.maestro_jobs j
  where j.organization_id = v_organization_id
    and j.legacy_record_id = new.payload ->> 'job_id';
  if v_job_id is null and nullif(new.payload ->> 'job_id', '') is not null then
    raise exception 'Timesheet job must belong to the same organization';
  end if;
  select c.id into v_client_id
  from public.maestro_clients c
  where c.organization_id = v_organization_id
    and c.legacy_record_id = new.payload ->> 'client_id';
  select p.id into v_project_id
  from public.maestro_projects p
  where p.organization_id = v_organization_id
    and p.legacy_record_id = new.payload ->> 'project_id';

  if nullif(new.payload ->> 'collaborator_id', '') is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_organization_id and m.collaborator_id = new.payload ->> 'collaborator_id'
  ) then raise exception 'Timesheet collaborator must belong to the same organization'; end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-timesheet-dual-write'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_timesheets (
    organization_id, legacy_record_id, legacy_job_record_id, job_id,
    client_legacy_record_id, client_id, project_legacy_record_id, project_id,
    collaborator_id, collaborator_name, job_title, status, is_running, is_rework,
    started_at, ended_at, duration_minutes, notes, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'job_id', v_job_id,
    new.payload ->> 'client_id', v_client_id, new.payload ->> 'project_id', v_project_id,
    new.payload ->> 'collaborator_id', new.payload ->> 'collaborator_name',
    new.payload ->> 'job_title', new.payload ->> 'status',
    case when new.payload ? 'is_running' then (new.payload ->> 'is_running')::boolean else null end,
    case when new.payload ? 'is_rework' then (new.payload ->> 'is_rework')::boolean else null end,
    case when new.payload ->> 'started_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'started_at')::timestamptz else null end,
    case when new.payload ->> 'ended_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'ended_at')::timestamptz else null end,
    case when new.payload ->> 'duration_minutes' ~ '^[0-9]+$' then (new.payload ->> 'duration_minutes')::integer else null end,
    new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
  ) on conflict (organization_id, legacy_record_id) do update set
    legacy_job_record_id = excluded.legacy_job_record_id, job_id = excluded.job_id,
    client_legacy_record_id = excluded.client_legacy_record_id, client_id = excluded.client_id,
    project_legacy_record_id = excluded.project_legacy_record_id, project_id = excluded.project_id,
    collaborator_id = excluded.collaborator_id, collaborator_name = excluded.collaborator_name,
    job_title = excluded.job_title, status = excluded.status, is_running = excluded.is_running,
    is_rework = excluded.is_rework, started_at = excluded.started_at, ended_at = excluded.ended_at,
    duration_minutes = excluded.duration_minutes, notes = excluded.notes,
    source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  return new;
end;
$$;
revoke execute on function public.maestro_sync_relational_timesheet() from public, anon, authenticated;
