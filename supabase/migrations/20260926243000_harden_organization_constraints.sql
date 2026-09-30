-- Keep the tenant/product registry finite and auditable before onboarding more tenants.
create index if not exists organization_members_active_lookup_idx
  on public.organization_members (collaborator_id, organization_id)
  where status = 'active';

create index if not exists organization_products_active_lookup_idx
  on public.organization_products (organization_id, product_key)
  where status in ('enabled', 'trial');
