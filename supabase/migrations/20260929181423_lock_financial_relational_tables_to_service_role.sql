-- Financial records are accessed through authenticated Edge Functions.
-- RLS does not protect TRUNCATE, REFERENCES, or TRIGGER privileges, so the
-- browser-facing roles must not hold direct table privileges on these tables.
revoke all privileges on table
  public.maestro_financial_entries,
  public.maestro_bank_accounts,
  public.maestro_cost_centers,
  public.maestro_financial_categories
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.maestro_financial_entries,
  public.maestro_bank_accounts,
  public.maestro_cost_centers,
  public.maestro_financial_categories
to service_role;

-- Keep future objects created by the migrations role closed by default.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
