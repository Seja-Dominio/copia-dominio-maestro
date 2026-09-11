-- Ads Brain accounts are shared across active collaborators.
-- The Meta authorization/token remains server-side; this constraint only
-- prevents the same external ad account from being stored more than once.

alter table public.maestro_ads_accounts
  drop constraint if exists maestro_ads_accounts_collaborator_id_network_external_accou_key;

alter table public.maestro_ads_accounts
  add constraint maestro_ads_accounts_network_external_account_key
  unique (network, external_account_id);

create index if not exists maestro_ads_accounts_network_external_account_idx
  on public.maestro_ads_accounts (network, external_account_id);
