-- Núcleo relacional de tarefas, com job_id nullable durante a reconciliação.

create table if not exists public.maestro_job_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  legacy_job_record_id text,
  job_id uuid references public.maestro_jobs(id) on delete set null,
  title text not null,
  status text,
  is_completed boolean,
  completed_at timestamptz,
  deadline date,
  task_order integer,
  responsible_id text,
  responsible_name text,
  resolution_status text not null default 'linked'
    check (resolution_status in ('linked', 'pending', 'archived', 'ignored')),
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_job_tasks_org_job_idx
  on public.maestro_job_tasks (organization_id, job_id, resolution_status);
create index if not exists maestro_job_tasks_org_responsible_idx
  on public.maestro_job_tasks (organization_id, responsible_id, status);
create index if not exists maestro_job_tasks_org_deadline_idx
  on public.maestro_job_tasks (organization_id, deadline);

alter table public.maestro_job_tasks enable row level security;

insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id, title, status,
  is_completed, completed_at, deadline, task_order, responsible_id, responsible_name,
  resolution_status, source_payload, created_at, updated_at
)
select
  s.organization_id,
  l.record_id,
  l.payload ->> 'job_id',
  j.id,
  coalesce(nullif(l.payload ->> 'title', ''), 'Tarefa sem título'),
  l.payload ->> 'status',
  case when l.payload ? 'is_completed' then (l.payload ->> 'is_completed')::boolean else null end,
  case when l.payload ->> 'completed_at' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'completed_at')::timestamptz else null end,
  case when l.payload ->> 'deadline' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'deadline')::date else null end,
  case when l.payload ->> 'order' ~ '^\\d+$' then (l.payload ->> 'order')::integer else null end,
  l.payload ->> 'responsible_id',
  l.payload ->> 'responsible_name',
  case when j.id is null then 'pending' else 'linked' end,
  l.payload,
  coalesce(l.source_created_at, now()),
  coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity
 and l.record_id = s.legacy_record_id
left join public.maestro_jobs j
  on j.organization_id = s.organization_id
 and j.legacy_record_id = l.payload ->> 'job_id'
where s.legacy_entity = 'Subtask'
  and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

comment on table public.maestro_job_tasks is
  'Tarefas relacionais; job_id permanece nullable enquanto subtasks órfãs aguardam reconciliação.';
