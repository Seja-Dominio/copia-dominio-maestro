-- Atomic tenant onboarding entrypoint for the backend.
create or replace function public.create_organization_tenant(
  p_name text,
  p_slug text,
  p_owner_collaborator_id text,
  p_product_key text default 'maestro',
  p_created_by text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations%rowtype;
  normalized_slug text := lower(trim(p_slug));
  normalized_product text := lower(trim(p_product_key));
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'organization name is required';
  end if;
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'organization slug is invalid';
  end if;
  if normalized_product not in ('maestro', 'cxm', 'ads_brain', 'insights') then
    raise exception 'product is invalid';
  end if;
  if not exists (select 1 from public.maestro_collaborators where id=p_owner_collaborator_id and is_active=true) then
    raise exception 'owner collaborator is invalid or inactive';
  end if;

  insert into public.organizations (name, slug, status, created_by, updated_by)
  values (trim(p_name), normalized_slug, 'active', p_created_by, p_created_by)
  returning * into new_org;

  insert into public.organization_members (organization_id, collaborator_id, role, status, created_by)
  values (new_org.id, p_owner_collaborator_id, 'owner', 'active', p_created_by);

  insert into public.organization_products (organization_id, product_key, status, plan_key)
  values (new_org.id, normalized_product, 'enabled', 'internal');

  return jsonb_build_object(
    'organization_id', new_org.id,
    'slug', new_org.slug,
    'product_key', normalized_product,
    'owner_collaborator_id', p_owner_collaborator_id
  );
end;
$$;

revoke all on function public.create_organization_tenant(text, text, text, text, text)
  from public, anon, authenticated;
