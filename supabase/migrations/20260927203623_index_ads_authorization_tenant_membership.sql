create index if not exists maestro_ads_authorizations_org_collaborator_idx
  on public.maestro_ads_authorizations (organization_id, collaborator_id);
