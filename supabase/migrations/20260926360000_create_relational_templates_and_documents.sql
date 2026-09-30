-- Templates de produção e documentos comerciais em tabelas tenant-aware.

create table if not exists public.maestro_job_templates (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default '',
  content_type text not null default '',
  team text not null default '',
  template_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create table if not exists public.maestro_proposals (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default '',
  client_legacy_record_id text,
  status text not null default '',
  proposal_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create table if not exists public.maestro_notes (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null default '',
  note_text text not null default '',
  note_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_job_templates_org_type_idx on public.maestro_job_templates (organization_id, content_type, updated_at desc);
create index if not exists maestro_proposals_org_client_idx on public.maestro_proposals (organization_id, client_legacy_record_id, updated_at desc);
create index if not exists maestro_notes_org_updated_idx on public.maestro_notes (organization_id, updated_at desc);

alter table public.maestro_job_templates enable row level security;
alter table public.maestro_proposals enable row level security;
alter table public.maestro_notes enable row level security;

insert into public.maestro_job_templates (legacy_record_id, organization_id, name, content_type, team, template_payload, source_updated_at, created_at, updated_at)
select l.record_id, s.organization_id, coalesce(l.payload->>'name',''), coalesce(l.payload->>'content_type',''), coalesce(l.payload->>'team',''), l.payload, l.source_updated_at, coalesce(l.source_created_at,now()), coalesce(l.source_updated_at,now())
from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id
where s.legacy_entity='JobTemplate' and s.scope_status='confirmed'
on conflict (legacy_record_id) do nothing;

insert into public.maestro_proposals (legacy_record_id, organization_id, title, client_legacy_record_id, status, proposal_payload, source_updated_at, created_at, updated_at)
select l.record_id, s.organization_id, coalesce(l.payload->>'title', l.payload->>'name',''), nullif(l.payload->>'client_id',''), coalesce(l.payload->>'status',''), l.payload, l.source_updated_at, coalesce(l.source_created_at,now()), coalesce(l.source_updated_at,now())
from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id
where s.legacy_entity='Proposal' and s.scope_status='confirmed'
on conflict (legacy_record_id) do nothing;

insert into public.maestro_notes (legacy_record_id, organization_id, title, note_text, note_payload, source_updated_at, created_at, updated_at)
select l.record_id, s.organization_id, coalesce(l.payload->>'title', l.payload->>'name',''), coalesce(l.payload->>'content', l.payload->>'text', l.payload->>'description',''), l.payload, l.source_updated_at, coalesce(l.source_created_at,now()), coalesce(l.source_updated_at,now())
from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id
where s.legacy_entity='Note' and s.scope_status='confirmed'
on conflict (legacy_record_id) do nothing;

comment on table public.maestro_job_templates is 'Templates de produção isolados por organização.';
comment on table public.maestro_proposals is 'Propostas comerciais isoladas por organização.';
comment on table public.maestro_notes is 'Notas operacionais isoladas por organização.';
