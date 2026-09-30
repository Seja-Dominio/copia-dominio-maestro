create table if not exists public.maestro_ai_query_logs (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  collaborator_id text,
  access_level text,
  tools jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maestro_ai_query_logs_org_created_idx
  on public.maestro_ai_query_logs (organization_id, created_at desc);
create index if not exists maestro_ai_query_logs_collaborator_idx
  on public.maestro_ai_query_logs (organization_id, collaborator_id, created_at desc);

alter table public.maestro_ai_query_logs enable row level security;

insert into public.maestro_ai_query_logs (
  id, organization_id, collaborator_id, access_level, tools, payload,
  source_created_at, source_updated_at, created_at, updated_at
)
select
  lr.record_id,
  lr.organization_id,
  nullif(lr.payload->>'collaborator_id', ''),
  nullif(lr.payload->>'access_level', ''),
  coalesce(lr.payload->'tools', '[]'::jsonb),
  lr.payload,
  lr.source_created_at,
  lr.source_updated_at,
  coalesce(lr.source_created_at, now()),
  coalesce(lr.source_updated_at, lr.source_created_at, now())
from public.legacy_records lr
where lr.entity = 'AIQueryLog'
on conflict (id) do update set
  organization_id = excluded.organization_id,
  collaborator_id = excluded.collaborator_id,
  access_level = excluded.access_level,
  tools = excluded.tools,
  payload = excluded.payload,
  source_created_at = excluded.source_created_at,
  source_updated_at = excluded.source_updated_at,
  updated_at = now();
