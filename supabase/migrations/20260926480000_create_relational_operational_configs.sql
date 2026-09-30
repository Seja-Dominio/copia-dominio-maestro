-- Configurações e pequenos registros operacionais tenant-aware.

create table if not exists public.maestro_conversation_states (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_key text not null default '',
  state_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, legacy_record_id)
);
create table if not exists public.maestro_audit_summaries (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  summary text not null default '',
  audit_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, legacy_record_id)
);
create table if not exists public.maestro_system_audit_logs (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action text not null default '',
  actor_legacy_record_id text,
  audit_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, legacy_record_id)
);
create table if not exists public.maestro_app_configs (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  config_key text not null default '',
  config_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, legacy_record_id)
);
create table if not exists public.maestro_squads (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default '',
  squad_payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (organization_id, legacy_record_id)
);

create index if not exists maestro_conversation_states_org_idx on public.maestro_conversation_states (organization_id, updated_at desc);
create index if not exists maestro_audit_summaries_org_idx on public.maestro_audit_summaries (organization_id, updated_at desc);
create index if not exists maestro_system_audit_logs_org_idx on public.maestro_system_audit_logs (organization_id, created_at desc);
create index if not exists maestro_app_configs_org_key_idx on public.maestro_app_configs (organization_id, config_key);
create index if not exists maestro_squads_org_name_idx on public.maestro_squads (organization_id, name);

alter table public.maestro_conversation_states enable row level security;
alter table public.maestro_audit_summaries enable row level security;
alter table public.maestro_system_audit_logs enable row level security;
alter table public.maestro_app_configs enable row level security;
alter table public.maestro_squads enable row level security;

insert into public.maestro_conversation_states (legacy_record_id,organization_id,conversation_key,state_payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'conversation_id',l.payload->>'group_id',l.record_id),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='DominusConversationState' and s.scope_status='confirmed' on conflict do nothing;
insert into public.maestro_audit_summaries (legacy_record_id,organization_id,summary,audit_payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'summary',l.payload->>'status',''),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='DominusAuditSummary' and s.scope_status='confirmed' on conflict do nothing;
insert into public.maestro_system_audit_logs (legacy_record_id,organization_id,action,actor_legacy_record_id,audit_payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'action',l.payload->>'event',''),nullif(l.payload->>'actor_id',''),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='SystemAuditLog' and s.scope_status='confirmed' on conflict do nothing;
insert into public.maestro_app_configs (legacy_record_id,organization_id,config_key,config_payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'key',l.payload->>'name',l.record_id),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='AppConfig' and s.scope_status='confirmed' on conflict do nothing;
insert into public.maestro_squads (legacy_record_id,organization_id,name,squad_payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'name',''),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='Squad' and s.scope_status='confirmed' on conflict do nothing;
