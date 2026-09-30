-- Tenant-aware adapter around the existing audited mutation function.
-- Keeping the old implementation intact limits regression risk while making
-- organization validation mandatory for the application write path.
create or replace function public.maestro_apply_legacy_mutation_scoped(
  p_organization_id uuid,
  p_action text,
  p_entity text,
  p_record_id text,
  p_payload jsonb,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org uuid;
  result jsonb;
begin
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then
    raise exception 'organization is not active';
  end if;

  if p_action in ('update', 'delete') then
    select organization_id into current_org
    from public.legacy_records
    where entity = p_entity and record_id = p_record_id;
    if current_org is distinct from p_organization_id then
      raise exception 'record does not belong to organization';
    end if;
  end if;

  perform set_config('maestro.organization_id', p_organization_id::text, true);
  select public.maestro_apply_legacy_mutation(
    p_action, p_entity, p_record_id, coalesce(p_payload, '{}'::jsonb), p_actor_id, p_actor_name
  ) into result;
  return result;
end;
$$;

revoke all on function public.maestro_apply_legacy_mutation_scoped(uuid, text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_apply_legacy_mutation_scoped(uuid, text, text, text, jsonb, text, text)
  to service_role;

create or replace function public.maestro_scope_legacy_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_org uuid;
  active_org uuid;
begin
  if new.organization_id is not null then
    return new;
  end if;

  begin
    configured_org := nullif(current_setting('maestro.organization_id', true), '')::uuid;
  exception when others then
    configured_org := null;
  end;

  if configured_org is not null then
    new.organization_id := configured_org;
    return new;
  end if;

  select o.id into active_org
  from public.organizations o
  where o.status = 'active'
    and (select count(*) from public.organizations o2 where o2.status = 'active') = 1
  limit 1;

  if active_org is not null then
    new.organization_id := active_org;
  end if;
  return new;
end;
$$;
