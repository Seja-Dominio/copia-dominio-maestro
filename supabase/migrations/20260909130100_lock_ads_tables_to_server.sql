-- Ads credentials and account data are accessed only by the Edge Function.
-- Keep direct Data API access denied even if table grants are changed later.

drop index if exists public.maestro_ads_accounts_network_external_account_idx;

create policy "Ads authorizations are server managed"
  on public.maestro_ads_authorizations
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "Ads accounts are server managed"
  on public.maestro_ads_accounts
  for all
  to anon, authenticated
  using (false)
  with check (false);
