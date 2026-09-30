-- Keep legacy + relational FinancialEntry writes in one PostgreSQL transaction.
-- The caller is an authenticated Edge Function using service_role; direct
-- execution is restricted to service_role and tenant scope is validated here.
do $$
begin
  if to_regclass('public.maestro_financial_entries') is null
    or to_regclass('public.maestro_bank_accounts') is null
    or to_regclass('public.maestro_financial_categories') is null
    or to_regclass('public.maestro_cost_centers') is null
    or to_regclass('public.legacy_cutover_registry') is null then
    raise exception 'Financial relational schema is incomplete; refusing to install atomic writer';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'maestro_financial_entries'
      and column_name in ('bank_account_legacy_record_id', 'cost_center_legacy_record_id', 'category_legacy_record_id')
    group by table_schema, table_name having count(*) = 3
  ) then
    raise exception 'Financial dimension reference columns are incomplete';
  end if;
end;
$$;

create or replace function public.maestro_upsert_financial_entries_scoped(
  p_organization_id uuid,
  p_entries jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_id text;
  v_client_id text;
  v_bank_account_id text;
  v_cost_center_id text;
  v_category_key text;
  v_subcategory_id text;
  v_write_legacy boolean;
  v_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_organization_id is null or not exists (
    select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active'
  ) then
    raise exception 'Financial entry organization is not active';
  end if;
  if pg_catalog.jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Financial entries must be a JSON array';
  end if;
  v_count := pg_catalog.jsonb_array_length(p_entries);
  if v_count < 1 or v_count > 200 then
    raise exception 'Send between 1 and 200 financial entries';
  end if;

  select r.legacy_write_allowed into v_write_legacy
  from public.legacy_cutover_registry r where r.entity = 'FinancialEntry';
  if not found then raise exception 'FinancialEntry cutover registry row is missing'; end if;

  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_entries) x(value)
    where nullif(pg_catalog.btrim(x.value ->> 'id'), '') is null
  ) then raise exception 'Every financial entry must have a non-empty id'; end if;
  if (select pg_catalog.count(distinct x.value ->> 'id') from pg_catalog.jsonb_array_elements(p_entries) x(value)) <> v_count then
    raise exception 'Financial entry IDs must be unique within a batch';
  end if;

  -- Serialize same-ID writes, including competing tenants, in a stable order.
  for v_id in
    select x.value ->> 'id' from pg_catalog.jsonb_array_elements(p_entries) x(value)
    order by x.value ->> 'id'
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id, 0));
  end loop;

  -- Global legacy IDs must never be reassigned across organizations. This
  -- check runs before any write; a later exception also rolls the whole call back.
  for v_entry in select x.value from pg_catalog.jsonb_array_elements(p_entries) x(value) loop
    v_id := v_entry ->> 'id';
    if exists (
      select 1 from public.legacy_records l
      where l.entity = 'FinancialEntry' and l.record_id = v_id
        and l.organization_id is distinct from p_organization_id
    ) or exists (
      select 1 from public.maestro_financial_entries f
      where f.legacy_record_id = v_id and f.organization_id <> p_organization_id
    ) then raise exception 'Financial entry ID belongs to another organization'; end if;
    if exists (
      select 1 from public.organization_legacy_records s
      where s.legacy_entity = 'FinancialEntry' and s.legacy_record_id = v_id
        and s.organization_id <> p_organization_id
    ) then raise exception 'Financial entry scope mapping belongs to another organization'; end if;

    v_client_id := nullif(v_entry ->> 'client_id', '');
    v_bank_account_id := coalesce(nullif(v_entry ->> 'bank_account_legacy_record_id', ''), nullif(v_entry ->> 'bank_account_id', ''));
    v_cost_center_id := coalesce(nullif(v_entry ->> 'cost_center_legacy_record_id', ''), nullif(v_entry ->> 'cost_center', ''));
    v_category_key := nullif(v_entry ->> 'category', '');
    v_subcategory_id := nullif(v_entry ->> 'subcategory_id', '');

    if nullif(v_entry ->> 'amount', '') is not null
      and (v_entry ->> 'amount') !~ '^-?[0-9]+([.,][0-9]+)?$' then
      raise exception 'Financial entry amount is invalid';
    end if;
    if v_client_id is not null and not exists (
      select 1 from public.maestro_clients c where c.organization_id = p_organization_id and c.legacy_record_id = v_client_id
    ) then
      if exists (
        select 1 from public.maestro_clients c where c.legacy_record_id = v_client_id
      ) or not exists (
        select 1
        from public.maestro_financial_entries f
        join public.relational_integrity_exceptions x
          on x.organization_id = f.organization_id
         and x.entity = 'FinancialEntry'
         and x.legacy_record_id = f.legacy_record_id
         and x.issue_type = 'missing_financial_client_link'
         and x.resolution_status = 'pending'
        where f.organization_id = p_organization_id
          and f.legacy_record_id = v_id
          and f.client_legacy_record_id is null
          and f.source_payload ->> 'client_id' = v_client_id
          and x.payload ->> 'client_legacy_record_id' = v_client_id
      ) then
        raise exception 'Financial entry client must belong to the same organization';
      end if;
    end if;
    if v_bank_account_id is not null and not exists (
      select 1 from public.maestro_bank_accounts a where a.organization_id = p_organization_id and a.legacy_record_id = v_bank_account_id
    ) then raise exception 'Financial entry bank account must belong to the same organization'; end if;
    if v_cost_center_id is not null and not exists (
      select 1 from public.maestro_cost_centers c where c.organization_id = p_organization_id and c.legacy_record_id = v_cost_center_id
    ) then raise exception 'Financial entry cost center must belong to the same organization'; end if;
    if v_subcategory_id is not null and not exists (
      select 1 from public.maestro_financial_categories c
      where c.organization_id = p_organization_id and c.legacy_record_id = v_subcategory_id and c.parent_key = v_category_key
    ) then raise exception 'Financial entry subcategory must belong to its same-organization category'; end if;
  end loop;

  if v_write_legacy then
    insert into public.organization_legacy_records (organization_id, legacy_entity, legacy_record_id, scope_status, source)
    select p_organization_id, 'FinancialEntry', x.value ->> 'id', 'confirmed', 'scoped-financial-entry-rpc'
    from pg_catalog.jsonb_array_elements(p_entries) x(value)
    on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

    insert into public.legacy_records (entity, record_id, organization_id, payload, source_created_at, source_updated_at)
    select 'FinancialEntry', x.value ->> 'id', p_organization_id, x.value,
      coalesce(nullif(x.value ->> 'created_date', '')::timestamptz, v_now), v_now
    from pg_catalog.jsonb_array_elements(p_entries) x(value)
    on conflict (entity, record_id) do update set
      payload = excluded.payload,
      source_updated_at = excluded.source_updated_at
    where public.legacy_records.organization_id = excluded.organization_id;

    if exists (
      select 1 from public.legacy_records l
      join pg_catalog.jsonb_array_elements(p_entries) x(value) on l.record_id = x.value ->> 'id'
      where l.entity = 'FinancialEntry' and l.organization_id is distinct from p_organization_id
    ) then raise exception 'Financial entry ID belongs to another organization'; end if;
  end if;

  insert into public.maestro_financial_entries (
    organization_id, legacy_record_id, client_legacy_record_id,
    bank_account_legacy_record_id, cost_center_legacy_record_id, category_legacy_record_id,
    type, title, amount, status, category, subcategory_id, subcategory_name,
    cost_center, bank_account_id, bank_account_name, due_date, competence_date,
    billing_date, payment_date, notes, source_payload, updated_at
  )
  select p_organization_id, x.value ->> 'id',
    case when exists (
      select 1 from public.maestro_clients c
      where c.organization_id = p_organization_id and c.legacy_record_id = nullif(x.value ->> 'client_id', '')
    ) then nullif(x.value ->> 'client_id', '') else null end,
    coalesce(nullif(x.value ->> 'bank_account_legacy_record_id', ''), nullif(x.value ->> 'bank_account_id', '')),
    coalesce(nullif(x.value ->> 'cost_center_legacy_record_id', ''), nullif(x.value ->> 'cost_center', '')),
    nullif(x.value ->> 'category_legacy_record_id', ''),
    nullif(x.value ->> 'type', ''), coalesce(nullif(x.value ->> 'title', ''), 'Lançamento sem título'),
    case when nullif(x.value ->> 'amount', '') is null then null
      when (x.value ->> 'amount') ~ '^-?[0-9]+([.,][0-9]+)?$' then pg_catalog.replace(x.value ->> 'amount', ',', '.')::numeric(14,2)
      else null end,
    nullif(x.value ->> 'status', ''), nullif(x.value ->> 'category', ''),
    nullif(x.value ->> 'subcategory_id', ''), nullif(x.value ->> 'subcategory_name', ''),
    nullif(x.value ->> 'cost_center', ''), nullif(x.value ->> 'bank_account_id', ''),
    nullif(x.value ->> 'bank_account_name', ''), nullif(x.value ->> 'due_date', '')::date,
    nullif(x.value ->> 'competence_date', '')::date, nullif(x.value ->> 'billing_date', '')::date,
    nullif(x.value ->> 'payment_date', '')::date, nullif(x.value ->> 'notes', ''), x.value, v_now
  from pg_catalog.jsonb_array_elements(p_entries) x(value)
  on conflict (organization_id, legacy_record_id) do update set
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

  return p_entries;
end;
$$;

revoke all on function public.maestro_upsert_financial_entries_scoped(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.maestro_upsert_financial_entries_scoped(uuid, jsonb) to service_role;
grant select, insert on public.organization_legacy_records to service_role;
