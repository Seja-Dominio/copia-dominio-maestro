alter table public.maestro_ads_accounts
  add column if not exists balance numeric,
  add column if not exists amount_spent numeric,
  add column if not exists metrics_data jsonb not null default '{}'::jsonb,
  add column if not exists campaigns_data jsonb not null default '[]'::jsonb,
  add column if not exists last_synced_at timestamptz;
