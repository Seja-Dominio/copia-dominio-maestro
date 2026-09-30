-- Núcleo relacional de apontamentos de horas.

create table if not exists public.maestro_timesheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  legacy_job_record_id text,
  job_id uuid references public.maestro_jobs(id) on delete set null,
  client_legacy_record_id text,
  project_legacy_record_id text,
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

create index if not exists maestro_timesheets_org_job_idx
  on public.maestro_timesheets (organization_id, job_id, started_at);
create index if not exists maestro_timesheets_org_collaborator_idx
  on public.maestro_timesheets (organization_id, collaborator_id, started_at);
create index if not exists maestro_timesheets_org_running_idx
  on public.maestro_timesheets (organization_id, is_running, status);

alter table public.maestro_timesheets enable row level security;

insert into public.maestro_timesheets (
  organization_id, legacy_record_id, legacy_job_record_id, job_id, client_legacy_record_id,
  project_legacy_record_id, collaborator_id, collaborator_name, job_title, status, is_running,
  is_rework, started_at, ended_at, duration_minutes, notes, source_payload, created_at, updated_at
)
select
  s.organization_id,
  l.record_id,
  l.payload ->> 'job_id',
  j.id,
  l.payload ->> 'client_id',
  l.payload ->> 'project_id',
  l.payload ->> 'collaborator_id',
  l.payload ->> 'collaborator_name',
  l.payload ->> 'job_title',
  l.payload ->> 'status',
  case when l.payload ? 'is_running' then (l.payload ->> 'is_running')::boolean else null end,
  case when l.payload ? 'is_rework' then (l.payload ->> 'is_rework')::boolean else null end,
  case when l.payload ->> 'started_at' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'started_at')::timestamptz else null end,
  case when l.payload ->> 'ended_at' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'ended_at')::timestamptz else null end,
  case when l.payload ->> 'duration_minutes' ~ '^\\d+$' then (l.payload ->> 'duration_minutes')::integer else null end,
  l.payload ->> 'notes', l.payload,
  coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity and l.record_id = s.legacy_record_id
left join public.maestro_jobs j
  on j.organization_id = s.organization_id and j.legacy_record_id = l.payload ->> 'job_id'
where s.legacy_entity = 'Timesheet' and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

comment on table public.maestro_timesheets is
  'Núcleo relacional de horas; job_id é nullable para preservar apontamentos sem Job válido.';
