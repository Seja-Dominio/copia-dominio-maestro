create table if not exists public.marketing_mix_observations (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  time date not null,
  geo text not null default 'national',
  kpi numeric not null check (kpi >= 0),
  paid jsonb not null default '{}'::jsonb check (jsonb_typeof(paid) = 'object'),
  organic jsonb not null default '{}'::jsonb check (jsonb_typeof(organic) = 'object'),
  searches jsonb not null default '{}'::jsonb check (jsonb_typeof(searches) = 'object'),
  leads numeric check (leads is null or leads >= 0),
  controls jsonb not null default '{}'::jsonb check (jsonb_typeof(controls) = 'object'),
  source text not null default 'internal_aggregate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, time, geo)
);

comment on table public.marketing_mix_observations is
  'Daily or weekly aggregate observations for internal MMM; no ad tokens, raw messages, names or creative files.';

create index if not exists marketing_mix_observations_client_time_idx
  on public.marketing_mix_observations (client_id, time desc, geo);

alter table public.marketing_mix_observations enable row level security;
revoke all on public.marketing_mix_observations from anon, authenticated;
