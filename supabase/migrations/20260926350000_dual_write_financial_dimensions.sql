-- Mantém dimensões financeiras relacionais sincronizadas durante a transição.

create or replace function public.maestro_sync_financial_dimension()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
begin
  if new.entity not in ('BankAccount', 'FinancialCategory', 'CostCenter') then return new; end if;
  select organization_id into v_org from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id limit 1;
  if v_org is null then
    select id into v_org from public.organizations where status = 'active' order by created_at asc limit 1;
  end if;
  if v_org is null then return new; end if;

  if new.entity = 'BankAccount' then
    insert into public.maestro_bank_accounts (legacy_record_id, organization_id, name, bank_name, account_type, color, balance, is_active, payload, source_updated_at)
    values (new.record_id, v_org, coalesce(new.payload->>'name',''), coalesce(new.payload->>'bank_name',''), coalesce(new.payload->>'account_type','checking'), coalesce(new.payload->>'color','#2563eb'),
      case when new.payload->>'balance' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(new.payload->>'balance', ',', '.')::numeric(14,2) else 0 end,
      coalesce((new.payload->>'is_active')::boolean, true), new.payload, new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, name=excluded.name, bank_name=excluded.bank_name, account_type=excluded.account_type, color=excluded.color, balance=excluded.balance, is_active=excluded.is_active, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();
  elsif new.entity = 'FinancialCategory' then
    insert into public.maestro_financial_categories (legacy_record_id, organization_id, name, category_type, display_order, is_active, payload, source_updated_at)
    values (new.record_id, v_org, coalesce(new.payload->>'name',''), coalesce(new.payload->>'type', new.payload->>'category_type', 'expense'), coalesce((new.payload->>'order')::integer,0), coalesce((new.payload->>'is_active')::boolean,true), new.payload, new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, name=excluded.name, category_type=excluded.category_type, display_order=excluded.display_order, is_active=excluded.is_active, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();
  else
    insert into public.maestro_cost_centers (legacy_record_id, organization_id, name, description, color, is_active, payload, source_updated_at)
    values (new.record_id, v_org, coalesce(new.payload->>'name',''), coalesce(new.payload->>'description',''), coalesce(new.payload->>'color','#2563eb'), coalesce((new.payload->>'is_active')::boolean,true), new.payload, new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, name=excluded.name, description=excluded.description, color=excluded.color, is_active=excluded.is_active, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists legacy_records_financial_dimension_sync on public.legacy_records;
create trigger legacy_records_financial_dimension_sync
after insert or update of entity, record_id, payload, source_updated_at
on public.legacy_records for each row execute function public.maestro_sync_financial_dimension();
revoke execute on function public.maestro_sync_financial_dimension() from public, anon, authenticated;

alter table public.maestro_financial_entries
  add column if not exists bank_account_legacy_record_id text,
  add column if not exists cost_center_legacy_record_id text,
  add column if not exists category_legacy_record_id text;

update public.maestro_financial_entries
set bank_account_legacy_record_id = nullif(bank_account_id, ''),
    cost_center_legacy_record_id = nullif(cost_center, ''),
    category_legacy_record_id = nullif(category, '')
where bank_account_legacy_record_id is null
   or cost_center_legacy_record_id is null
   or category_legacy_record_id is null;

create index if not exists maestro_financial_entries_org_bank_idx on public.maestro_financial_entries (organization_id, bank_account_legacy_record_id);
create index if not exists maestro_financial_entries_org_cost_idx on public.maestro_financial_entries (organization_id, cost_center_legacy_record_id);
create index if not exists maestro_financial_entries_org_category_idx on public.maestro_financial_entries (organization_id, category_legacy_record_id);

create or replace function public.maestro_sync_financial_entry_dimension_refs()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.entity = 'FinancialEntry' then
    update public.maestro_financial_entries
    set bank_account_legacy_record_id = nullif(new.payload->>'bank_account_id',''),
        cost_center_legacy_record_id = nullif(new.payload->>'cost_center',''),
        category_legacy_record_id = nullif(new.payload->>'category',''),
        updated_at = coalesce(new.source_updated_at, now())
    where legacy_record_id = new.record_id;
  end if;
  return new;
end;
$$;
drop trigger if exists legacy_records_financial_entry_dimension_refs on public.legacy_records;
create trigger legacy_records_financial_entry_dimension_refs
after insert or update of entity, record_id, payload, source_updated_at
on public.legacy_records for each row execute function public.maestro_sync_financial_entry_dimension_refs();
revoke execute on function public.maestro_sync_financial_entry_dimension_refs() from public, anon, authenticated;
