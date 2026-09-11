alter table public.maestro_ads_accounts
  add column if not exists spending_limit numeric(14, 2);

alter table public.maestro_ads_accounts
  add constraint maestro_ads_accounts_spending_limit_nonnegative
  check (spending_limit is null or spending_limit >= 0) not valid;

alter table public.maestro_ads_accounts
  validate constraint maestro_ads_accounts_spending_limit_nonnegative;
