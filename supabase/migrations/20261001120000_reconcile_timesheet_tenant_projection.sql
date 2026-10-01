-- Bring incomplete installations to the tenant-aware Timesheet contract,
-- without replaying or repairing historical migration ledger entries.

do $$
declare
  v_missing text;
begin
  select string_agg(required.name, ', ' order by required.name)
    into v_missing
  from unnest(array[
    'organizations', 'legacy_records', 'organization_legacy_records',
    'maestro_clients', 'maestro_projects', 'maestro_jobs',
    'organization_members', 'legacy_cutover_registry'
  ]) as required(name)
  where to_regclass('public.' || required.name) is null;

  if v_missing is not null then
    raise exception 'Cannot reconcile Timesheet; required public relations are missing: %', v_missing;
  end if;

  if exists (
    select 1 from public.legacy_cutover_registry
    where entity = 'Timesheet'
      and (module_key <> 'maestro' or relational_table is distinct from 'maestro_timesheets')
  ) then
    raise exception 'Timesheet cutover registry has an unexpected owner or relational target';
  end if;
end
$$;

create table if not exists public.maestro_timesheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  legacy_job_record_id text,
  job_id uuid references public.maestro_jobs(id) on delete set null,
  client_legacy_record_id text,
  client_id uuid,
  project_legacy_record_id text,
  project_id uuid,
  collaborator_id text,
  collaborator_name text,
  job_title text,
  status text,
  is_running boolean,
  is_rework boolean,
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer,
  notes text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

alter table public.maestro_timesheets
  add column if not exists client_id uuid,
  add column if not exists project_id uuid;

create index if not exists maestro_timesheets_org_job_idx
  on public.maestro_timesheets (organization_id, job_id, started_at);
create index if not exists maestro_timesheets_org_collaborator_idx
  on public.maestro_timesheets (organization_id, collaborator_id, started_at);
create index if not exists maestro_timesheets_org_running_idx
  on public.maestro_timesheets (organization_id, is_running, status);
create index if not exists maestro_timesheets_org_job_id_idx
  on public.maestro_timesheets (organization_id, job_id);
create index if not exists maestro_timesheets_org_client_identity_idx
  on public.maestro_timesheets (organization_id, client_id, client_legacy_record_id);
create index if not exists maestro_timesheets_org_project_identity_idx
  on public.maestro_timesheets (organization_id, project_id, project_legacy_record_id);

insert into public.legacy_cutover_registry (
  entity, module_key, relational_table, read_mode, write_mode,
  legacy_read_allowed, legacy_write_allowed, status, evidence
) values (
  'Timesheet', 'maestro', 'maestro_timesheets', 'relational', 'dual',
  true, true, 'candidate',
  'Tenant-scoped relational reads with legacy dual-write; projection and same-tenant relations verified by forward reconciliation.'
)
on conflict (entity) do update set
  module_key = excluded.module_key,
  relational_table = excluded.relational_table,
  read_mode = excluded.read_mode,
  write_mode = excluded.write_mode,
  legacy_read_allowed = excluded.legacy_read_allowed,
  legacy_write_allowed = excluded.legacy_write_allowed,
  status = excluded.status,
  evidence = excluded.evidence,
  updated_at = pg_catalog.now();

-- These candidate keys are required as the referenced side of composite
-- tenant foreign keys. Production-shaped installs may have the legacy
-- organization/ID keys but not the stricter relational identities yet.
do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_jobs'::regclass and conname = 'maestro_jobs_organization_id_id_key';
  if v_definition is null then
    alter table public.maestro_jobs add constraint maestro_jobs_organization_id_id_key unique (organization_id, id);
  elsif v_definition <> 'UNIQUE (organization_id, id)' then
    raise exception 'Unexpected maestro_jobs_organization_id_id_key definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_clients'::regclass and conname = 'maestro_clients_organization_id_id_key';
  if v_definition is null then
    alter table public.maestro_clients add constraint maestro_clients_organization_id_id_key unique (organization_id, id);
  elsif v_definition <> 'UNIQUE (organization_id, id)' then
    raise exception 'Unexpected maestro_clients_organization_id_id_key definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_clients'::regclass and conname = 'maestro_clients_org_id_legacy_key';
  if v_definition is null then
    alter table public.maestro_clients add constraint maestro_clients_org_id_legacy_key unique (organization_id, id, legacy_record_id);
  elsif v_definition <> 'UNIQUE (organization_id, id, legacy_record_id)' then
    raise exception 'Unexpected maestro_clients_org_id_legacy_key definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_projects'::regclass and conname = 'maestro_projects_organization_id_id_key';
  if v_definition is null then
    alter table public.maestro_projects add constraint maestro_projects_organization_id_id_key unique (organization_id, id);
  elsif v_definition <> 'UNIQUE (organization_id, id)' then
    raise exception 'Unexpected maestro_projects_organization_id_id_key definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_projects'::regclass and conname = 'maestro_projects_org_id_legacy_key';
  if v_definition is null then
    alter table public.maestro_projects add constraint maestro_projects_org_id_legacy_key unique (organization_id, id, legacy_record_id);
  elsif v_definition <> 'UNIQUE (organization_id, id, legacy_record_id)' then
    raise exception 'Unexpected maestro_projects_org_id_legacy_key definition: %', v_definition;
  end if;
end
$$;

-- Backfill only explicitly confirmed tenant mappings. A missing or
-- cross-tenant Job stays nullable while the legacy snapshot is retained.
insert into public.maestro_timesheets (
  organization_id, legacy_record_id, legacy_job_record_id, job_id,
  client_legacy_record_id, client_id, project_legacy_record_id, project_id,
  collaborator_id, collaborator_name, job_title, status, is_running, is_rework,
  started_at, ended_at, duration_minutes, notes, source_payload,
  created_at, updated_at
)
select
  scope.organization_id,
  legacy.record_id,
  legacy.payload ->> 'job_id',
  job.id,
  legacy.payload ->> 'client_id',
  client.id,
  legacy.payload ->> 'project_id',
  project.id,
  legacy.payload ->> 'collaborator_id',
  legacy.payload ->> 'collaborator_name',
  legacy.payload ->> 'job_title',
  legacy.payload ->> 'status',
  case when legacy.payload ->> 'is_running' in ('true', 'false')
    then (legacy.payload ->> 'is_running')::boolean end,
  case when legacy.payload ->> 'is_rework' in ('true', 'false')
    then (legacy.payload ->> 'is_rework')::boolean end,
  case when pg_catalog.pg_input_is_valid(legacy.payload ->> 'started_at', 'timestamp with time zone')
    then (legacy.payload ->> 'started_at')::timestamptz end,
  case when pg_catalog.pg_input_is_valid(legacy.payload ->> 'ended_at', 'timestamp with time zone')
    then (legacy.payload ->> 'ended_at')::timestamptz end,
  case when legacy.payload ->> 'duration_minutes' ~ '^[0-9]{1,10}$'
    then case when (legacy.payload ->> 'duration_minutes')::numeric <= 2147483647
      then (legacy.payload ->> 'duration_minutes')::integer end end,
  legacy.payload ->> 'notes',
  legacy.payload,
  coalesce(legacy.source_created_at, pg_catalog.now()),
  coalesce(legacy.source_updated_at, pg_catalog.now())
from public.organization_legacy_records scope
join public.legacy_records legacy
  on legacy.entity = scope.legacy_entity
  and legacy.record_id = scope.legacy_record_id
left join public.maestro_jobs job
  on job.organization_id = scope.organization_id
  and job.legacy_record_id = legacy.payload ->> 'job_id'
left join public.maestro_clients client
  on client.organization_id = scope.organization_id
  and client.legacy_record_id = legacy.payload ->> 'client_id'
left join public.maestro_projects project
  on project.organization_id = scope.organization_id
  and project.legacy_record_id = legacy.payload ->> 'project_id'
where scope.legacy_entity = 'Timesheet'
  and scope.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

-- Resolve existing snapshots to typed parents within the same tenant only.
update public.maestro_timesheets timesheet
set job_id = job.id
from public.maestro_jobs job
where timesheet.job_id is null
  and timesheet.organization_id = job.organization_id
  and timesheet.legacy_job_record_id = job.legacy_record_id;

update public.maestro_timesheets timesheet
set client_id = client.id
from public.maestro_clients client
where timesheet.client_id is null
  and timesheet.organization_id = client.organization_id
  and timesheet.client_legacy_record_id = client.legacy_record_id;

update public.maestro_timesheets timesheet
set project_id = project.id
from public.maestro_projects project
where timesheet.project_id is null
  and timesheet.organization_id = project.organization_id
  and timesheet.project_legacy_record_id = project.legacy_record_id;

-- Repair only empty projections; do not overwrite values already normalized.
update public.maestro_timesheets
set duration_minutes = case
  when source_payload ->> 'duration_minutes' ~ '^[0-9]{1,10}$'
  then case when (source_payload ->> 'duration_minutes')::numeric <= 2147483647
    then (source_payload ->> 'duration_minutes')::integer end
  end
where duration_minutes is null;

update public.maestro_timesheets
set started_at = case
  when pg_catalog.pg_input_is_valid(source_payload ->> 'started_at', 'timestamp with time zone')
  then (source_payload ->> 'started_at')::timestamptz end
where started_at is null;

update public.maestro_timesheets
set ended_at = case
  when pg_catalog.pg_input_is_valid(source_payload ->> 'ended_at', 'timestamp with time zone')
  then (source_payload ->> 'ended_at')::timestamptz end
where ended_at is null;

do $$
declare
  v_definition text;
begin
  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_timesheets'::regclass and conname = 'maestro_timesheets_org_job_fk';
  if v_definition is null then
    alter table public.maestro_timesheets add constraint maestro_timesheets_org_job_fk
      foreign key (organization_id, job_id)
      references public.maestro_jobs (organization_id, id)
      on delete set null (job_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, job_id) REFERENCES maestro_jobs(organization_id, id)%' then
    raise exception 'Unexpected maestro_timesheets_org_job_fk definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_timesheets'::regclass and conname = 'maestro_timesheets_org_client_identity_fk';
  if v_definition is null then
    alter table public.maestro_timesheets add constraint maestro_timesheets_org_client_identity_fk
      foreign key (organization_id, client_id, client_legacy_record_id)
      references public.maestro_clients (organization_id, id, legacy_record_id)
      on delete set null (client_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, client_id, client_legacy_record_id) REFERENCES maestro_clients(organization_id, id, legacy_record_id)%' then
    raise exception 'Unexpected maestro_timesheets_org_client_identity_fk definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
  where conrelid = 'public.maestro_timesheets'::regclass and conname = 'maestro_timesheets_org_project_identity_fk';
  if v_definition is null then
    alter table public.maestro_timesheets add constraint maestro_timesheets_org_project_identity_fk
      foreign key (organization_id, project_id, project_legacy_record_id)
      references public.maestro_projects (organization_id, id, legacy_record_id)
      on delete set null (project_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, project_id, project_legacy_record_id) REFERENCES maestro_projects(organization_id, id, legacy_record_id)%' then
    raise exception 'Unexpected maestro_timesheets_org_project_identity_fk definition: %', v_definition;
  end if;
end
$$;

alter table public.maestro_timesheets
  validate constraint maestro_timesheets_org_job_fk,
  validate constraint maestro_timesheets_org_client_identity_fk,
  validate constraint maestro_timesheets_org_project_identity_fk;

alter table public.maestro_timesheets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_select') then
    create policy maestro_timesheets_org_select on public.maestro_timesheets for select to authenticated
      using (exists (select 1 from public.organization_members m where m.organization_id = maestro_timesheets.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = 'active'));
  elsif not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_select' and cmd = 'SELECT' and roles = array['authenticated']::name[] and qual like '%organization_members%' and qual like '%organization_id%' and qual like '%uid()%' and qual like '%active%') then
    raise exception 'Unexpected maestro_timesheets_org_select policy';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_insert') then
    create policy maestro_timesheets_org_insert on public.maestro_timesheets for insert to authenticated
      with check (exists (select 1 from public.organization_members m where m.organization_id = maestro_timesheets.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = 'active'));
  elsif not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_insert' and cmd = 'INSERT' and roles = array['authenticated']::name[] and with_check like '%organization_members%' and with_check like '%organization_id%' and with_check like '%uid()%' and with_check like '%active%') then
    raise exception 'Unexpected maestro_timesheets_org_insert policy';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_update') then
    create policy maestro_timesheets_org_update on public.maestro_timesheets for update to authenticated
      using (exists (select 1 from public.organization_members m where m.organization_id = maestro_timesheets.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = 'active'))
      with check (exists (select 1 from public.organization_members m where m.organization_id = maestro_timesheets.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = 'active'));
  elsif not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_update' and cmd = 'UPDATE' and roles = array['authenticated']::name[] and qual like '%organization_members%' and with_check like '%organization_members%' and qual like '%organization_id%' and with_check like '%organization_id%' and qual like '%uid()%' and with_check like '%uid()%' and qual like '%active%' and with_check like '%active%') then
    raise exception 'Unexpected maestro_timesheets_org_update policy';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_delete') then
    create policy maestro_timesheets_org_delete on public.maestro_timesheets for delete to authenticated
      using (exists (select 1 from public.organization_members m where m.organization_id = maestro_timesheets.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = 'active' and m.role in ('master', 'gestor')));
  elsif not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'maestro_timesheets' and policyname = 'maestro_timesheets_org_delete' and cmd = 'DELETE' and roles = array['authenticated']::name[] and qual like '%organization_members%' and qual like '%organization_id%' and qual like '%uid()%' and qual like '%active%' and qual like '%master%' and qual like '%gestor%') then
    raise exception 'Unexpected maestro_timesheets_org_delete policy';
  end if;
end
$$;

-- This app routes relational access through signed Edge Functions. Keep the
-- Data API closed to client roles while allowing the backend writer role.
revoke all privileges on table public.maestro_timesheets from public, anon, authenticated;
grant select, insert, update, delete on table public.maestro_timesheets to service_role;

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
  v_raw_duration text;
  v_raw_started text;
  v_raw_ended text;
  v_duration integer;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_is_running boolean;
  v_is_rework boolean;
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

  select job.id into v_job_id from public.maestro_jobs job
  where job.organization_id = v_organization_id
    and job.legacy_record_id = new.payload ->> 'job_id';
  if v_job_id is null and nullif(new.payload ->> 'job_id', '') is not null then
    raise exception 'Timesheet job must belong to the same organization';
  end if;
  select client.id into v_client_id from public.maestro_clients client
  where client.organization_id = v_organization_id
    and client.legacy_record_id = new.payload ->> 'client_id';
  select project.id into v_project_id from public.maestro_projects project
  where project.organization_id = v_organization_id
    and project.legacy_record_id = new.payload ->> 'project_id';

  if nullif(new.payload ->> 'collaborator_id', '') is not null and not exists (
    select 1 from public.organization_members member
    where member.organization_id = v_organization_id
      and member.collaborator_id = new.payload ->> 'collaborator_id'
  ) then
    raise exception 'Timesheet collaborator must belong to the same organization';
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-timesheet-dual-write'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  v_raw_duration := new.payload ->> 'duration_minutes';
  v_raw_started := new.payload ->> 'started_at';
  v_raw_ended := new.payload ->> 'ended_at';

  if new.payload ->> 'is_running' in ('true', 'false') then
    v_is_running := (new.payload ->> 'is_running')::boolean;
  end if;
  if new.payload ->> 'is_rework' in ('true', 'false') then
    v_is_rework := (new.payload ->> 'is_rework')::boolean;
  end if;
  if v_raw_started is not null
    and pg_catalog.pg_input_is_valid(v_raw_started, 'timestamp with time zone') then
    v_started_at := v_raw_started::timestamptz;
  end if;
  if v_raw_ended is not null
    and pg_catalog.pg_input_is_valid(v_raw_ended, 'timestamp with time zone') then
    v_ended_at := v_raw_ended::timestamptz;
  end if;
  if v_raw_duration ~ '^[0-9]{1,10}$' then
    if v_raw_duration::numeric <= 2147483647 then
      v_duration := v_raw_duration::integer;
    end if;
  end if;

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
    v_is_running, v_is_rework, v_started_at, v_ended_at, v_duration,
    new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
  ) on conflict (organization_id, legacy_record_id) do update set
    legacy_job_record_id = excluded.legacy_job_record_id,
    job_id = excluded.job_id,
    client_legacy_record_id = excluded.client_legacy_record_id,
    client_id = excluded.client_id,
    project_legacy_record_id = excluded.project_legacy_record_id,
    project_id = excluded.project_id,
    collaborator_id = excluded.collaborator_id,
    collaborator_name = excluded.collaborator_name,
    job_title = excluded.job_title,
    status = excluded.status,
    is_running = excluded.is_running,
    is_rework = excluded.is_rework,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    duration_minutes = excluded.duration_minutes,
    notes = excluded.notes,
    source_payload = excluded.source_payload,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists legacy_records_relational_timesheet_sync on public.legacy_records;
create trigger legacy_records_relational_timesheet_sync
  after insert or update of entity, record_id, payload, source_updated_at
  on public.legacy_records for each row
  execute function public.maestro_sync_relational_timesheet();
revoke execute on function public.maestro_sync_relational_timesheet() from public, anon, authenticated;
