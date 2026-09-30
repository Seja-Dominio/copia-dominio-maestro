-- Primeiro núcleo relacional do Maestro.
-- Expande o modelo sem substituir legacy_records nem alterar seus leitores.

create table if not exists public.maestro_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  name text not null,
  company_name text,
  status text,
  email text,
  phone text,
  metadata jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create table if not exists public.maestro_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  client_legacy_record_id text,
  name text not null,
  status text,
  reference_month text,
  metadata jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create table if not exists public.maestro_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  project_legacy_record_id text,
  client_legacy_record_id text,
  title text not null,
  status text,
  content_type text,
  post_date date,
  briefing text,
  caption text,
  metadata jsonb not null default '{}'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_clients_org_status_idx
  on public.maestro_clients (organization_id, status);
create index if not exists maestro_projects_org_client_idx
  on public.maestro_projects (organization_id, client_legacy_record_id);
create index if not exists maestro_jobs_org_project_idx
  on public.maestro_jobs (organization_id, project_legacy_record_id);
create index if not exists maestro_jobs_org_post_date_idx
  on public.maestro_jobs (organization_id, post_date);

alter table public.maestro_clients enable row level security;
alter table public.maestro_projects enable row level security;
alter table public.maestro_jobs enable row level security;

-- Backfill idempotente a partir do mapa de escopo já validado.
insert into public.maestro_clients (
  organization_id, legacy_record_id, name, company_name, status, email, phone, source_payload
)
select
  s.organization_id,
  l.record_id,
  coalesce(nullif(l.payload ->> 'name', ''), nullif(l.payload ->> 'company_name', ''), 'Cliente sem nome'),
  l.payload ->> 'company_name',
  l.payload ->> 'status',
  l.payload ->> 'email',
  l.payload ->> 'phone',
  l.payload
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity
 and l.record_id = s.legacy_record_id
where s.legacy_entity = 'Client'
  and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

insert into public.maestro_projects (
  organization_id, legacy_record_id, client_legacy_record_id, name, status, reference_month, source_payload
)
select
  s.organization_id,
  l.record_id,
  l.payload ->> 'client_id',
  coalesce(nullif(l.payload ->> 'name', ''), 'Projeto sem nome'),
  l.payload ->> 'status',
  l.payload ->> 'reference_month',
  l.payload
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity
 and l.record_id = s.legacy_record_id
where s.legacy_entity = 'Project'
  and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

insert into public.maestro_jobs (
  organization_id, legacy_record_id, project_legacy_record_id, client_legacy_record_id,
  title, status, content_type, post_date, briefing, caption, source_payload
)
select
  s.organization_id,
  l.record_id,
  l.payload ->> 'project_id',
  l.payload ->> 'client_id',
  coalesce(nullif(l.payload ->> 'title', ''), 'Job sem título'),
  l.payload ->> 'status',
  l.payload ->> 'content_type',
  case when l.payload ->> 'post_date' ~ '^\\d{4}-\\d{2}-\\d{2}'
    then (l.payload ->> 'post_date')::date else null end,
  l.payload ->> 'briefing',
  l.payload ->> 'caption',
  l.payload
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity
 and l.record_id = s.legacy_record_id
where s.legacy_entity = 'Job'
  and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

comment on table public.maestro_clients is 'Núcleo relacional de clientes; legado preservado em source_payload durante a transição.';
comment on table public.maestro_projects is 'Núcleo relacional de projetos; vínculos legados são mantidos durante o backfill.';
comment on table public.maestro_jobs is 'Núcleo relacional de jobs; leitores atuais continuam usando legacy_records nesta fase.';
