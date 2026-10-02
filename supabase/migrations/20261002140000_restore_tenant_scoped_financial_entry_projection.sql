-- Restore the tenant-aware FinancialEntry projection when an environment's
-- historical ledger has a stale function body. This is intentionally
-- fail-closed: require the full target schema and active trigger first. The
-- canonical body is also reapplied during clean replay to keep both paths
-- deterministic.
do $guard$
begin
  if current_setting('transaction_read_only') = 'on' then
    raise exception 'Cannot restore FinancialEntry projection in a read-only transaction';
  end if;
  if to_regclass('public.legacy_records') is null
    or to_regclass('public.organization_legacy_records') is null
    or to_regclass('public.organizations') is null
    or to_regclass('public.maestro_clients') is null
    or to_regclass('public.maestro_bank_accounts') is null
    or to_regclass('public.maestro_cost_centers') is null
    or to_regclass('public.maestro_financial_entries') is null then
    raise exception 'Required tenant-aware FinancialEntry projection relations are missing';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.maestro_financial_entries'::regclass
      and attname = 'bank_account_legacy_record_id' and not attisdropped
  ) then
    raise exception 'FinancialEntry bank-account tenant reference column is missing';
  end if;
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'legacy_records'
      and t.tgfoid = to_regprocedure('public.maestro_sync_relational_financial_entry()')
      and not t.tgisinternal and t.tgenabled <> 'D'
  ) then
    raise exception 'Active FinancialEntry projection trigger is missing';
  end if;
end;
$guard$;

create or replace function public.maestro_sync_relational_financial_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_client_id text := nullif(new.payload ->> 'client_id', '');
  v_bank_account_id text := nullif(new.payload ->> 'bank_account_id', '');
  v_cost_center_id text := nullif(new.payload ->> 'cost_center_legacy_record_id', '');
  v_category_key text := nullif(new.payload ->> 'category', '');
begin
  if new.entity <> 'FinancialEntry' then return new; end if;
  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then raise exception 'Financial entry organization mapping is ambiguous'; end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then return new; end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Financial entry organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'Financial entry organization is not active';
  end if;
  if v_client_id is not null and not exists (
    select 1 from public.maestro_clients c
    where c.organization_id = v_organization_id and c.legacy_record_id = v_client_id
  ) then raise exception 'Financial entry client must belong to the same organization'; end if;
  if v_bank_account_id is not null and not exists (
    select 1 from public.maestro_bank_accounts a
    where a.organization_id = v_organization_id and a.legacy_record_id = v_bank_account_id
  ) then raise exception 'Financial entry bank account must belong to the same organization'; end if;
  if v_cost_center_id is not null and not exists (
    select 1 from public.maestro_cost_centers c
    where c.organization_id = v_organization_id and c.legacy_record_id = v_cost_center_id
  ) then raise exception 'Financial entry cost center must belong to the same organization'; end if;
  insert into public.organization_legacy_records
    (organization_id, legacy_entity, legacy_record_id, scope_status, source)
  values (v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-financial-entry-dual-write')
  on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_financial_entries (
    organization_id, legacy_record_id, client_legacy_record_id,
    bank_account_legacy_record_id, cost_center_legacy_record_id, category_legacy_record_id,
    type, title, amount, status, category, subcategory_id, subcategory_name,
    cost_center, bank_account_id, bank_account_name, due_date, competence_date,
    billing_date, payment_date, notes, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, v_client_id,
    v_bank_account_id, v_cost_center_id, v_category_key, new.payload ->> 'type',
    coalesce(nullif(new.payload ->> 'title', ''), 'Lançamento sem título'),
    case when new.payload ->> 'amount' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(new.payload ->> 'amount', ',', '.')::numeric(14,2) else null end,
    new.payload ->> 'status', new.payload ->> 'category', nullif(new.payload ->> 'subcategory_id', ''),
    new.payload ->> 'subcategory_name', new.payload ->> 'cost_center', new.payload ->> 'bank_account_id',
    new.payload ->> 'bank_account_name',
    case when new.payload ->> 'due_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'due_date')::date else null end,
    case when new.payload ->> 'competence_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'competence_date')::date else null end,
    case when new.payload ->> 'billing_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'billing_date')::date else null end,
    case when new.payload ->> 'payment_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'payment_date')::date else null end,
    new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
  ) on conflict (organization_id, legacy_record_id) do update set
    client_legacy_record_id = excluded.client_legacy_record_id,
    bank_account_legacy_record_id = excluded.bank_account_legacy_record_id,
    cost_center_legacy_record_id = excluded.cost_center_legacy_record_id,
    category_legacy_record_id = excluded.category_legacy_record_id,
    type = excluded.type, title = excluded.title, amount = excluded.amount, status = excluded.status,
    category = excluded.category, subcategory_id = excluded.subcategory_id,
    subcategory_name = excluded.subcategory_name, cost_center = excluded.cost_center,
    bank_account_id = excluded.bank_account_id, bank_account_name = excluded.bank_account_name,
    due_date = excluded.due_date, competence_date = excluded.competence_date,
    billing_date = excluded.billing_date, payment_date = excluded.payment_date,
    notes = excluded.notes, source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke execute on function public.maestro_sync_relational_financial_entry()
  from public, anon, authenticated;
