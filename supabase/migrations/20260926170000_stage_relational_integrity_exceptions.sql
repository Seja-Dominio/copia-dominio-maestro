-- Registra exceções que impedem constraints relacionais obrigatórias.

create table if not exists public.relational_integrity_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity text not null,
  legacy_record_id text not null,
  issue_type text not null,
  payload jsonb not null default '{}'::jsonb,
  resolution_status text not null default 'pending'
    check (resolution_status in ('pending', 'resolved', 'accepted_legacy')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (organization_id, entity, legacy_record_id, issue_type)
);

create index if not exists relational_integrity_exceptions_status_idx
  on public.relational_integrity_exceptions (organization_id, resolution_status, entity);

alter table public.relational_integrity_exceptions enable row level security;

insert into public.relational_integrity_exceptions (
  organization_id, entity, legacy_record_id, issue_type, payload
)
select
  j.organization_id,
  'Job',
  j.legacy_record_id,
  'missing_project_or_client_link',
  j.source_payload
from public.maestro_jobs j
where j.project_id is null or j.client_id is null
on conflict (organization_id, entity, legacy_record_id, issue_type) do nothing;

comment on table public.relational_integrity_exceptions is
  'Exceções de integridade registradas antes de tornar vínculos relacionais obrigatórios.';
