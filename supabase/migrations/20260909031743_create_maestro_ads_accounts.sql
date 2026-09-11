create table if not exists public.maestro_ads_authorizations (
  id uuid primary key default gen_random_uuid(),
  collaborator_id text not null references public.maestro_collaborators(id) on delete cascade,
  network text not null check (network in ('Meta Ads', 'Google Ads', 'TikTok Ads')),
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now()
);

create table if not exists public.maestro_ads_accounts (
  id uuid primary key default gen_random_uuid(),
  collaborator_id text not null references public.maestro_collaborators(id) on delete cascade,
  authorization_id uuid references public.maestro_ads_authorizations(id) on delete set null,
  network text not null check (network in ('Meta Ads', 'Google Ads', 'TikTok Ads')),
  external_account_id text not null,
  external_account_name text not null,
  client_name text not null check (length(trim(client_name)) > 0),
  display_name text not null check (length(trim(display_name)) > 0),
  currency text,
  account_status integer,
  metrics_config jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collaborator_id, network, external_account_id)
);

create index if not exists maestro_ads_accounts_collaborator_idx
  on public.maestro_ads_accounts (collaborator_id, updated_at desc);
create index if not exists maestro_ads_accounts_authorization_idx
  on public.maestro_ads_accounts (authorization_id);
create index if not exists maestro_ads_authorizations_collaborator_idx
  on public.maestro_ads_authorizations (collaborator_id);

alter table public.maestro_ads_authorizations enable row level security;
alter table public.maestro_ads_accounts enable row level security;

revoke all on public.maestro_ads_authorizations from anon, authenticated;
revoke all on public.maestro_ads_accounts from anon, authenticated;
