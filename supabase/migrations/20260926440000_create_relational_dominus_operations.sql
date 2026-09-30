-- Operações do Dominus: logs, mensagens enviadas e fila de mensagens.

create table if not exists public.maestro_dominus_query_logs (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  query_text text not null default '',
  status text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);
create table if not exists public.maestro_dominus_sent_messages (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id text,
  message_text text not null default '',
  status text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);
create table if not exists public.maestro_dominus_pending_messages (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id text,
  group_id text,
  question text not null default '',
  status text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_dominus_query_logs_org_idx on public.maestro_dominus_query_logs (organization_id, created_at desc);
create index if not exists maestro_dominus_sent_messages_org_idx on public.maestro_dominus_sent_messages (organization_id, created_at desc);
create index if not exists maestro_dominus_pending_messages_org_status_idx on public.maestro_dominus_pending_messages (organization_id, status, created_at desc);
alter table public.maestro_dominus_query_logs enable row level security;
alter table public.maestro_dominus_sent_messages enable row level security;
alter table public.maestro_dominus_pending_messages enable row level security;

insert into public.maestro_dominus_query_logs (legacy_record_id,organization_id,query_text,status,payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,coalesce(l.payload->>'query',l.payload->>'question',''),coalesce(l.payload->>'status',''),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='DominusQueryLog' and s.scope_status='confirmed' on conflict do nothing;
insert into public.maestro_dominus_sent_messages (legacy_record_id,organization_id,group_id,message_text,status,payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,nullif(l.payload->>'group_id',''),coalesce(l.payload->>'message',l.payload->>'text',''),coalesce(l.payload->>'status',''),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='DominusSentMessage' and s.scope_status='confirmed' on conflict do nothing;
insert into public.maestro_dominus_pending_messages (legacy_record_id,organization_id,message_id,group_id,question,status,payload,source_updated_at,created_at,updated_at)
select l.record_id,s.organization_id,nullif(l.payload->>'message_id',''),nullif(l.payload->>'group_id',''),coalesce(l.payload->>'question',''),coalesce(l.payload->>'status',''),l.payload,l.source_updated_at,coalesce(l.source_created_at,now()),coalesce(l.source_updated_at,now()) from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id where s.legacy_entity='DominusPendingMessage' and s.scope_status='confirmed' on conflict do nothing;
