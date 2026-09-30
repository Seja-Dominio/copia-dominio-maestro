-- Preserva Subtasks cujo Job pai não existe mais.
-- Não altera nem remove registros de legacy_records.

create table if not exists public.job_task_reconciliation (
  id uuid primary key default gen_random_uuid(),
  legacy_entity text not null default 'Subtask',
  legacy_record_id text not null,
  legacy_job_id text not null,
  payload jsonb not null default '{}'::jsonb,
  source_status text,
  resolution_status text not null default 'pending' check (resolution_status in ('pending', 'linked', 'archived', 'ignored')),
  resolved_job_id text,
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  unique (legacy_entity, legacy_record_id)
);

create index if not exists job_task_reconciliation_status_idx
  on public.job_task_reconciliation (resolution_status, created_at);

create index if not exists job_task_reconciliation_legacy_job_idx
  on public.job_task_reconciliation (legacy_job_id);

alter table public.job_task_reconciliation enable row level security;

insert into public.job_task_reconciliation (
  legacy_record_id,
  legacy_job_id,
  payload,
  source_status
)
select
  s.record_id,
  s.payload ->> 'job_id',
  s.payload,
  s.payload ->> 'status'
from public.legacy_records s
left join public.legacy_records j
  on j.entity = 'Job'
 and j.record_id = s.payload ->> 'job_id'
where s.entity = 'Subtask'
  and j.record_id is null
  and nullif(s.payload ->> 'job_id', '') is not null
on conflict (legacy_entity, legacy_record_id) do nothing;

comment on table public.job_task_reconciliation is
  'Fila de reconciliação para Subtasks legadas cujo Job pai foi removido ou perdeu o vínculo.';
