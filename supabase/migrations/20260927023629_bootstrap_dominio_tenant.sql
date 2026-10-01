-- Bootstrap the existing single-agency Dev account before tenant-scoped
-- session checks are enabled. Existing legacy data belongs to this agency;
-- customer-level CXM separation remains keyed by the Client record.
do $$
declare
  agency_id uuid;
  owner_id text;
begin
  select id into owner_id
  from public.maestro_collaborators
  where is_active = true
    and lower(coalesce(profile->>'access_level', '')) in ('master', 'admin')
  order by case when profile->>'full_name' = 'Jhonatan Grimm' then 0 else 1 end, id
  limit 1;

  if owner_id is null then
    if exists (select 1 from public.legacy_records) then
      raise exception 'Tenant bootstrap requires an active Master/Admin collaborator before scoping existing legacy data';
    end if;
    raise notice 'Tenant bootstrap deferred: this empty schema has no active Master/Admin collaborator';
    return;
  end if;

  select id into agency_id
  from public.organizations
  where slug = 'dominio-performance';

  if agency_id is null then
    insert into public.organizations (name, slug, status)
    values ('Domínio Performance', 'dominio-performance', 'active')
    returning id into agency_id;
  end if;

  insert into public.organization_members (organization_id, collaborator_id, role, status)
  values (agency_id, owner_id, 'owner', 'active')
  on conflict (organization_id, collaborator_id) do nothing;

  insert into public.organization_members (organization_id, collaborator_id, role, status)
  select
    agency_id,
    mc.id,
    case
      when lower(coalesce(mc.profile->>'access_level', '')) in ('master', 'admin') then 'admin'
      when lower(coalesce(mc.profile->>'access_level', '')) in ('gestor', 'manager') then 'manager'
      when lower(coalesce(mc.profile->>'access_level', '')) in ('viewer', 'visualizador') then 'viewer'
      else 'member'
    end,
    'active'
  from public.maestro_collaborators mc
  where mc.is_active = true and mc.id <> owner_id
  on conflict (organization_id, collaborator_id) do nothing;

  insert into public.organization_products (organization_id, product_key, status, plan_key)
  values
    (agency_id, 'maestro', 'enabled', 'internal'),
    (agency_id, 'cxm', 'enabled', 'internal'),
    (agency_id, 'ads_brain', 'enabled', 'internal'),
    (agency_id, 'insights', 'enabled', 'internal')
  on conflict (organization_id, product_key) do nothing;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  )
  select agency_id, lr.entity, lr.record_id, 'confirmed', 'single-agency-dev-bootstrap'
  from public.legacy_records lr
  on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;
end;
$$;

grant execute on function public.create_organization_tenant(text, text, text, text, text)
  to service_role;
