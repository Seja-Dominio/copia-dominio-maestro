-- Materialize the tenant scope on the legacy ledger so every API read can
-- apply a direct, indexed organization predicate during the transition.
alter table public.legacy_records
  add column if not exists organization_id uuid;

update public.legacy_records lr
set organization_id = olr.organization_id
from public.organization_legacy_records olr
where lr.organization_id is null
  and olr.legacy_entity = lr.entity
  and olr.legacy_record_id = lr.record_id;

create index if not exists idx_legacy_records_organization_entity_updated
  on public.legacy_records (organization_id, entity, source_updated_at desc, record_id);

create or replace function public.maestro_scope_legacy_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_org uuid;
begin
  if new.organization_id is not null then
    return new;
  end if;

  -- Safe compatibility behavior while the account has one tenant. Once more
  -- tenants exist, the application must send organization_id explicitly.
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

drop trigger if exists trg_maestro_scope_legacy_record on public.legacy_records;
create trigger trg_maestro_scope_legacy_record
before insert on public.legacy_records
for each row execute function public.maestro_scope_legacy_record();
