-- Diferencia a chave fixa da categoria principal da subcategoria configurável.
-- A expansão mantém category e o payload compatíveis com as telas atuais.

alter table public.maestro_financial_categories
  add column parent_key text;

update public.maestro_financial_categories
set parent_key = nullif(pg_catalog.btrim(payload ->> 'parent_key'), '')
where parent_key is distinct from nullif(pg_catalog.btrim(payload ->> 'parent_key'), '');

create unique index maestro_financial_categories_org_record_parent_uidx
  on public.maestro_financial_categories (organization_id, legacy_record_id, parent_key);

-- Um seletor sem valor representa ausência de subcategoria, não uma chave vazia.
update public.maestro_financial_entries
set subcategory_id = null
where subcategory_id = '';

create index maestro_financial_entries_org_subcategory_parent_idx
  on public.maestro_financial_entries (organization_id, subcategory_id, category)
  where subcategory_id is not null;

do $$
declare
  v_invalid_count bigint;
begin
  select count(*) into v_invalid_count
  from public.maestro_financial_entries e
  where e.subcategory_id is not null
    and not exists (
      select 1
      from public.maestro_financial_categories c
      where c.organization_id = e.organization_id
        and c.legacy_record_id = e.subcategory_id
        and c.parent_key = e.category
    );

  if v_invalid_count > 0 then
    raise exception 'Cannot validate financial subcategory references: % invalid rows', v_invalid_count;
  end if;
end;
$$;

alter table public.maestro_financial_entries
  add constraint maestro_financial_entries_org_subcategory_parent_fk
  foreign key (organization_id, subcategory_id, category)
  references public.maestro_financial_categories (organization_id, legacy_record_id, parent_key)
  on delete set null (subcategory_id)
  not valid;

alter table public.maestro_financial_entries
  validate constraint maestro_financial_entries_org_subcategory_parent_fk;

-- Nunca deduzir o tenant escolhendo a primeira organização ativa. A associação
-- explícita do registro legado tem precedência; a coluna tenant do registro é
-- fallback compatível. Divergências falham fechadas.
create or replace function public.maestro_sync_financial_dimension()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
  v_mapped_orgs uuid[];
begin
  if new.entity not in ('BankAccount', 'FinancialCategory', 'CostCenter') then return new; end if;

  select array_agg(distinct organization_id) into v_mapped_orgs
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;

  if cardinality(v_mapped_orgs) > 1 then
    raise exception 'Financial dimension organization mapping is ambiguous';
  end if;
  v_org := v_mapped_orgs[1];

  if v_org is null then v_org := new.organization_id; end if;
  if v_org is null then return new; end if;
  if new.organization_id is not null and new.organization_id <> v_org then
    raise exception 'Financial dimension organization scope mismatch';
  end if;

  if new.entity = 'BankAccount' then
    insert into public.maestro_bank_accounts (legacy_record_id, organization_id, name, bank_name, account_type, color, balance, is_active, payload, source_updated_at)
    values (new.record_id, v_org, coalesce(new.payload->>'name',''), coalesce(new.payload->>'bank_name',''), coalesce(new.payload->>'account_type','checking'), coalesce(new.payload->>'color','#2563eb'),
      case when new.payload->>'balance' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(new.payload->>'balance', ',', '.')::numeric(14,2) else 0 end,
      coalesce((new.payload->>'is_active')::boolean, true), new.payload, new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, name=excluded.name, bank_name=excluded.bank_name, account_type=excluded.account_type, color=excluded.color, balance=excluded.balance, is_active=excluded.is_active, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();
  elsif new.entity = 'FinancialCategory' then
    insert into public.maestro_financial_categories (legacy_record_id, organization_id, name, category_type, display_order, parent_key, is_active, payload, source_updated_at)
    values (new.record_id, v_org, coalesce(new.payload->>'name',''), coalesce(new.payload->>'type', new.payload->>'category_type', 'expense'), coalesce((new.payload->>'order')::integer,0), nullif(btrim(new.payload->>'parent_key'), ''), coalesce((new.payload->>'is_active')::boolean,true), new.payload, new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, name=excluded.name, category_type=excluded.category_type, display_order=excluded.display_order, parent_key=excluded.parent_key, is_active=excluded.is_active, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();
  else
    insert into public.maestro_cost_centers (legacy_record_id, organization_id, name, description, color, is_active, payload, source_updated_at)
    values (new.record_id, v_org, coalesce(new.payload->>'name',''), coalesce(new.payload->>'description',''), coalesce(new.payload->>'color','#2563eb'), coalesce((new.payload->>'is_active')::boolean,true), new.payload, new.source_updated_at)
    on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, name=excluded.name, description=excluded.description, color=excluded.color, is_active=excluded.is_active, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();
  end if;
  return new;
end;
$$;

-- O dual-write de lançamento não pode emitir string vazia para uma FK opcional.
create or replace function public.maestro_sync_relational_financial_entry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_mapped_organizations uuid[];
begin
  if new.entity <> 'FinancialEntry' then return new; end if;
  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Financial entry organization mapping is ambiguous';
  end if;
  v_organization_id := v_mapped_organizations[1];
  if v_organization_id is null then v_organization_id := new.organization_id; end if;
  if v_organization_id is null then return new; end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Financial entry organization scope mismatch';
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-financial-entry-trigger'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_financial_entries (
    organization_id, legacy_record_id, client_legacy_record_id, type, title, amount, status,
    category, subcategory_id, subcategory_name, cost_center, bank_account_id, bank_account_name,
    due_date, competence_date, billing_date, payment_date, notes, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'client_id', new.payload ->> 'type',
    coalesce(nullif(new.payload ->> 'title', ''), 'Lançamento sem título'),
    case when new.payload ->> 'amount' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(new.payload ->> 'amount', ',', '.')::numeric(14,2) else null end,
    new.payload ->> 'status', new.payload ->> 'category', nullif(new.payload ->> 'subcategory_id', ''), new.payload ->> 'subcategory_name',
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

comment on column public.maestro_financial_entries.category is
  'Fixed system category key (for example fee/media/production), not a FinancialCategory record ID.';
comment on column public.maestro_financial_entries.subcategory_id is
  'Legacy ID of a tenant-owned configurable FinancialCategory subcategory.';
