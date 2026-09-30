-- Repair orphaned relational client references before enforcing tenant FKs.
-- The original source_payload remains untouched for compatibility and audit.
do $$
begin
  if to_regclass('public.maestro_financial_entries') is null
    or to_regclass('public.maestro_clients') is null
    or to_regclass('public.maestro_cost_centers') is null
    or to_regclass('public.relational_integrity_exceptions') is null then
    raise exception 'Financial tenant-link prerequisites are missing';
  end if;
end;
$$;

insert into public.relational_integrity_exceptions (
  organization_id, entity, legacy_record_id, issue_type, payload
)
select
  e.organization_id,
  'FinancialEntry',
  e.legacy_record_id,
  'missing_financial_client_link',
  jsonb_build_object(
    'client_legacy_record_id', e.client_legacy_record_id,
    'source_payload_retained', true
  )
from public.maestro_financial_entries e
where e.client_legacy_record_id is not null
  and not exists (
    select 1 from public.maestro_clients c
    where c.organization_id = e.organization_id
      and c.legacy_record_id = e.client_legacy_record_id
  )
on conflict (organization_id, entity, legacy_record_id, issue_type) do nothing;

update public.maestro_financial_entries e
set client_legacy_record_id = null
where e.client_legacy_record_id is not null
  and not exists (
    select 1 from public.maestro_clients c
    where c.organization_id = e.organization_id
      and c.legacy_record_id = e.client_legacy_record_id
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_financial_entries'::regclass
      and conname = 'maestro_financial_entries_org_client_fk'
  ) then
    alter table public.maestro_financial_entries
      add constraint maestro_financial_entries_org_client_fk
      foreign key (organization_id, client_legacy_record_id)
      references public.maestro_clients (organization_id, legacy_record_id)
      on delete set null (client_legacy_record_id)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_financial_entries'::regclass
      and conname = 'maestro_financial_entries_org_cost_center_fk'
  ) then
    alter table public.maestro_financial_entries
      add constraint maestro_financial_entries_org_cost_center_fk
      foreign key (organization_id, cost_center_legacy_record_id)
      references public.maestro_cost_centers (organization_id, legacy_record_id)
      on delete set null (cost_center_legacy_record_id)
      not valid;
  end if;
end;
$$;

alter table public.maestro_financial_entries
  validate constraint maestro_financial_entries_org_client_fk;
alter table public.maestro_financial_entries
  validate constraint maestro_financial_entries_org_cost_center_fk;
