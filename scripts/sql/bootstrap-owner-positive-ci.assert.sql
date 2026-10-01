do $assert_bootstrap_positive$
declare
  v_organization_id uuid;
begin
  select id into v_organization_id
  from public.organizations
  where slug = 'dominio-performance';

  if v_organization_id is null then
    raise exception 'Owner bootstrap did not find or create the agency organization';
  end if;

  if not exists (
    select 1 from public.organization_members
    where organization_id = v_organization_id
      and collaborator_id = 'bootstrap-owner-positive-ci'
      and role = 'owner' and status = 'active'
  ) then
    raise exception 'Owner bootstrap did not create the active owner membership';
  end if;

  if (select count(*) from public.organization_products
      where organization_id = v_organization_id
        and product_key in ('maestro', 'cxm', 'ads_brain', 'insights')) <> 4 then
    raise exception 'Owner bootstrap did not enable all four agency products';
  end if;

  if (select count(*) from public.organization_legacy_records
      where organization_id = v_organization_id
        and legacy_entity = 'BootstrapOwnerGuardCIPositive'
        and legacy_record_id = 'synthetic-owned-record'
        and scope_status = 'confirmed'
        and source = 'single-agency-dev-bootstrap') <> 1 then
    raise exception 'Owner bootstrap did not map the legacy record exactly once';
  end if;
end;
$assert_bootstrap_positive$;
