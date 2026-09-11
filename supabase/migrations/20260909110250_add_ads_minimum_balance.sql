alter table public.maestro_ads_accounts
  add column if not exists minimum_balance numeric(14, 2)
  check (minimum_balance is null or minimum_balance >= 0);
