-- A record's tenant is immutable after insert. This protects service-role
-- upserts using the legacy (entity, record_id) key from moving data between
-- organizations, including races that a preflight lookup cannot prevent.
create or replace function public.maestro_prevent_legacy_organization_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'legacy record organization_id is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.maestro_prevent_legacy_organization_reassignment()
  from public, anon, authenticated;

drop trigger if exists legacy_records_organization_immutable on public.legacy_records;
create trigger legacy_records_organization_immutable
  before update of organization_id on public.legacy_records
  for each row execute function public.maestro_prevent_legacy_organization_reassignment();
