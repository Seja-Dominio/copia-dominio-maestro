-- Tenant scope for Ads Brain OAuth and managed ad accounts.
alter table public.maestro_ads_accounts
  add column if not exists organization_id uuid;
alter table public.maestro_ads_authorizations
  add column if not exists organization_id uuid;

update public.maestro_ads_accounts a
set organization_id = m.organization_id
from public.organization_members m
where a.organization_id is null
  and m.collaborator_id = a.collaborator_id
  and m.status = 'active';

update public.maestro_ads_authorizations a
set organization_id = m.organization_id
from public.organization_members m
where a.organization_id is null
  and m.collaborator_id = a.collaborator_id
  and m.status = 'active';

do $$
begin
  if exists (select 1 from public.maestro_ads_accounts where organization_id is null)
     or exists (select 1 from public.maestro_ads_authorizations where organization_id is null) then
    raise exception 'Ads Brain records without organization_id';
  end if;
end;
$$;

alter table public.maestro_ads_accounts alter column organization_id set not null;
alter table public.maestro_ads_authorizations alter column organization_id set not null;

alter table public.maestro_ads_accounts
  add constraint maestro_ads_accounts_organization_fk
  foreign key (organization_id) references public.organizations(id);
alter table public.maestro_ads_authorizations
  add constraint maestro_ads_authorizations_organization_fk
  foreign key (organization_id) references public.organizations(id);

create index if not exists maestro_ads_accounts_org_status_idx
  on public.maestro_ads_accounts (organization_id, account_status);
create index if not exists maestro_ads_authorizations_org_network_idx
  on public.maestro_ads_authorizations (organization_id, network);
