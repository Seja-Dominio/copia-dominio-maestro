-- Comentários de jobs em modelo relacional tenant-aware.

create table if not exists public.maestro_job_comments (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_legacy_record_id text,
  author_legacy_record_id text,
  content text not null default '',
  mentions jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_job_comments_org_job_idx on public.maestro_job_comments (organization_id, job_legacy_record_id, created_at desc);
alter table public.maestro_job_comments enable row level security;

insert into public.maestro_job_comments (legacy_record_id, organization_id, job_legacy_record_id, author_legacy_record_id, content, mentions, payload, source_updated_at, created_at, updated_at)
select l.record_id, s.organization_id, nullif(l.payload->>'entity_id',''), nullif(l.payload->>'created_by_id',''), coalesce(l.payload->>'content',''),
  case when jsonb_typeof(l.payload->'mentions')='array' then l.payload->'mentions' else '[]'::jsonb end, l.payload, l.source_updated_at, coalesce(l.source_created_at,now()), coalesce(l.source_updated_at,now())
from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id
where s.legacy_entity='Comment' and s.scope_status='confirmed' and coalesce(l.payload->>'entity_type','job')='job'
on conflict (legacy_record_id) do nothing;
