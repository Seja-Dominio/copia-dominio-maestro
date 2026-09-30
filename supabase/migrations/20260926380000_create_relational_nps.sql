-- NPS relacional para CXM e Insights.

create table if not exists public.maestro_nps_entries (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_legacy_record_id text,
  month date,
  monthly_score integer,
  notes text not null default '',
  recorded_by text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create table if not exists public.maestro_nps_history (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_legacy_record_id text,
  job_legacy_record_id text,
  event_type text not null default '',
  delta integer,
  score_before integer,
  score_after integer,
  description text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_nps_entries_org_client_idx on public.maestro_nps_entries (organization_id, client_legacy_record_id, month desc);
create index if not exists maestro_nps_history_org_client_idx on public.maestro_nps_history (organization_id, client_legacy_record_id, created_at desc);
create index if not exists maestro_nps_history_org_event_idx on public.maestro_nps_history (organization_id, event_type, created_at desc);

alter table public.maestro_nps_entries enable row level security;
alter table public.maestro_nps_history enable row level security;

insert into public.maestro_nps_entries (legacy_record_id, organization_id, client_legacy_record_id, month, monthly_score, notes, recorded_by, payload, source_updated_at, created_at, updated_at)
select l.record_id, s.organization_id, nullif(l.payload->>'client_id',''),
  case when l.payload->>'month' ~ '^\\d{4}-\\d{2}' then (l.payload->>'month')::date else null end,
  case when l.payload->>'monthly_score' ~ '^-?\\d+$' then (l.payload->>'monthly_score')::integer else null end,
  coalesce(l.payload->>'notes',''), coalesce(l.payload->>'recorded_by',''), l.payload, l.source_updated_at, coalesce(l.source_created_at,now()), coalesce(l.source_updated_at,now())
from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id
where s.legacy_entity='NpsEntry' and s.scope_status='confirmed'
on conflict (legacy_record_id) do nothing;

insert into public.maestro_nps_history (legacy_record_id, organization_id, client_legacy_record_id, job_legacy_record_id, event_type, delta, score_before, score_after, description, payload, source_updated_at, created_at, updated_at)
select l.record_id, s.organization_id, nullif(l.payload->>'client_id',''), nullif(l.payload->>'job_id',''), coalesce(l.payload->>'event_type',''),
  case when l.payload->>'delta' ~ '^-?\\d+$' then (l.payload->>'delta')::integer else null end,
  case when l.payload->>'score_before' ~ '^-?\\d+$' then (l.payload->>'score_before')::integer else null end,
  case when l.payload->>'score_after' ~ '^-?\\d+$' then (l.payload->>'score_after')::integer else null end,
  coalesce(l.payload->>'description',''), l.payload, l.source_updated_at, coalesce(l.source_created_at,now()), coalesce(l.source_updated_at,now())
from public.organization_legacy_records s join public.legacy_records l on l.entity=s.legacy_entity and l.record_id=s.legacy_record_id
where s.legacy_entity='NpsHistory' and s.scope_status='confirmed'
on conflict (legacy_record_id) do nothing;
