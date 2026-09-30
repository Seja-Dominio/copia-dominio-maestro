-- Dual-write financeiro durante a migração progressiva.

create or replace function public.maestro_sync_relational_financial_entry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_second_organization uuid;
begin
  if new.entity <> 'FinancialEntry' then return new; end if;
  select id into v_organization_id from public.organizations
  where status = 'active' order by created_at asc limit 1;
  select id into v_second_organization from public.organizations
  where status = 'active' and id <> v_organization_id limit 1;
  if v_organization_id is null or v_second_organization is not null then return new; end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'single-organization-trigger'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_financial_entries (
    organization_id, legacy_record_id, client_legacy_record_id, type, title, amount, status,
    category, subcategory_id, subcategory_name, cost_center, bank_account_id, bank_account_name,
    due_date, competence_date, billing_date, payment_date, notes, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'client_id', new.payload ->> 'type',
    coalesce(nullif(new.payload ->> 'title', ''), 'Lançamento sem título'),
    case when new.payload ->> 'amount' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(new.payload ->> 'amount', ',', '.')::numeric(14,2) else null end,
    new.payload ->> 'status', new.payload ->> 'category', new.payload ->> 'subcategory_id', new.payload ->> 'subcategory_name',
    new.payload ->> 'cost_center', new.payload ->> 'bank_account_id', new.payload ->> 'bank_account_name',
    case when new.payload ->> 'due_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'due_date')::date else null end,
    case when new.payload ->> 'competence_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'competence_date')::date else null end,
    case when new.payload ->> 'billing_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'billing_date')::date else null end,
    case when new.payload ->> 'payment_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'payment_date')::date else null end,
    new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at, now())
  )
  on conflict (organization_id, legacy_record_id) do update set
    client_legacy_record_id=excluded.client_legacy_record_id, type=excluded.type, title=excluded.title,
    amount=excluded.amount, status=excluded.status, category=excluded.category,
    subcategory_id=excluded.subcategory_id, subcategory_name=excluded.subcategory_name,
    cost_center=excluded.cost_center, bank_account_id=excluded.bank_account_id, bank_account_name=excluded.bank_account_name,
    due_date=excluded.due_date, competence_date=excluded.competence_date, billing_date=excluded.billing_date,
    payment_date=excluded.payment_date, notes=excluded.notes, source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists legacy_records_relational_financial_entry_sync on public.legacy_records;
create trigger legacy_records_relational_financial_entry_sync
after insert or update of entity, record_id, payload, source_updated_at
on public.legacy_records
for each row execute function public.maestro_sync_relational_financial_entry();

revoke execute on function public.maestro_sync_relational_financial_entry() from public, anon, authenticated;
