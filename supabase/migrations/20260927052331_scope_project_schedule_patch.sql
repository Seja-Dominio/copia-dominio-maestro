-- Lock and verify the owning tenant before delegating to the legacy audited
-- schedule patch, which historically addressed projects by global record ID.
create or replace function public.maestro_patch_project_schedule_scoped(
  p_organization_id uuid,
  p_record_id text,
  p_patch jsonb,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_organization_id uuid;
begin
  if not exists (
    select 1 from public.organizations
    where id = p_organization_id and status = 'active'
  ) then
    raise exception 'organization is not active' using errcode = '42501';
  end if;

  select organization_id into current_organization_id
  from public.legacy_records
  where entity = 'Project' and record_id = p_record_id
  for update;

  if current_organization_id is distinct from p_organization_id then
    raise exception 'project does not belong to organization' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('maestro.organization_id', p_organization_id::text, true);
  return public.maestro_patch_project_schedule(p_record_id, p_patch, p_actor_id, p_actor_name);
end;
$$;

revoke all on function public.maestro_patch_project_schedule_scoped(uuid, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_patch_project_schedule_scoped(uuid, text, jsonb, text, text)
  to service_role;
