-- Make Ads Brain ownership relationships tenant-aware at the database layer.
-- Account rows are organization-shared; collaborator_id records who owns the
-- shared link, while an OAuth authorization may be created by another member.
create unique index if not exists maestro_ads_authorizations_org_id_uidx
  on public.maestro_ads_authorizations (organization_id, id);

create index if not exists maestro_ads_accounts_org_collaborator_idx
  on public.maestro_ads_accounts (organization_id, collaborator_id);

create index if not exists maestro_ads_accounts_org_authorization_idx
  on public.maestro_ads_accounts (organization_id, authorization_id)
  where authorization_id is not null;

alter table public.maestro_ads_authorizations
  add constraint maestro_ads_authorizations_org_member_fk
  foreign key (organization_id, collaborator_id)
  references public.organization_members (organization_id, collaborator_id);

alter table public.maestro_ads_accounts
  add constraint maestro_ads_accounts_org_member_fk
  foreign key (organization_id, collaborator_id)
  references public.organization_members (organization_id, collaborator_id);

alter table public.maestro_ads_accounts
  add constraint maestro_ads_accounts_org_authorization_fk
  foreign key (organization_id, authorization_id)
  references public.maestro_ads_authorizations (organization_id, id);
