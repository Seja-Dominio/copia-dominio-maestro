-- Core-only subset of the tenant-aware legacy projection; CXM and other
-- modules from the mixed historical migration are intentionally omitted.
create or replace function public.maestro_sync_relational_job_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_client_id text := nullif(new.payload ->> 'client_id', '');
  v_cost_center_id text := nullif(new.payload ->> 'cost_center_legacy_record_id', '');
  v_active_count integer;
  v_job_id uuid;
begin
  if new.entity <> 'Subtask' then return new; end if;
  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then raise exception 'Subtask organization mapping is ambiguous'; end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Subtask organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'Subtask organization is not active';
  end if;

  select j.id into v_job_id from public.maestro_jobs j
  where j.organization_id = v_organization_id and j.legacy_record_id = new.payload ->> 'job_id';
  if v_job_id is null and nullif(new.payload ->> 'job_id', '') is not null then
    raise exception 'Subtask job must belong to the same organization';
  end if;
  insert into public.organization_legacy_records
    (organization_id, legacy_entity, legacy_record_id, scope_status, source)
  values (v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-subtask-dual-write')
  on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_job_tasks (
    organization_id, legacy_record_id, legacy_job_record_id, job_id, title, status,
    is_completed, completed_at, deadline, task_order, responsible_id, responsible_name,
    resolution_status, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'job_id', v_job_id,
    coalesce(nullif(new.payload ->> 'title', ''), 'Tarefa sem título'), new.payload ->> 'status',
    case when new.payload ? 'is_completed' then (new.payload ->> 'is_completed')::boolean else null end,
    case when new.payload ->> 'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'completed_at')::timestamptz else null end,
    case when new.payload ->> 'deadline' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'deadline')::date else null end,
    case when new.payload ->> 'order' ~ '^[0-9]+$' then (new.payload ->> 'order')::integer else null end,
    new.payload ->> 'responsible_id', new.payload ->> 'responsible_name',
    case when v_job_id is null then 'pending' else 'linked' end, new.payload,
    coalesce(new.source_updated_at, pg_catalog.now())
  ) on conflict (organization_id, legacy_record_id) do update set
    legacy_job_record_id = excluded.legacy_job_record_id, job_id = excluded.job_id,
    title = excluded.title, status = excluded.status, is_completed = excluded.is_completed,
    completed_at = excluded.completed_at, deadline = excluded.deadline, task_order = excluded.task_order,
    responsible_id = excluded.responsible_id, responsible_name = excluded.responsible_name,
    resolution_status = excluded.resolution_status, source_payload = excluded.source_payload,
    updated_at = excluded.updated_at;
  return new;
end;
$$;
revoke execute on function public.maestro_sync_relational_job_task() from public, anon, authenticated;

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
    bank_account_legacy_record_id, cost_center_legacy_record_id, category_legacy_record_id, type, title, amount, status,
    category, subcategory_id, subcategory_name, cost_center, bank_account_id, bank_account_name,
    due_date, competence_date, billing_date, payment_date, notes, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, v_client_id,
    v_bank_account_id, v_cost_center_id, v_category_key, new.payload ->> 'type',
    coalesce(nullif(new.payload ->> 'title', ''), 'Lançamento sem título'),
    case when new.payload ->> 'amount' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(new.payload ->> 'amount', ',', '.')::numeric(14,2) else null end,
    new.payload ->> 'status', new.payload ->> 'category', nullif(new.payload ->> 'subcategory_id', ''), new.payload ->> 'subcategory_name',
    new.payload ->> 'cost_center', new.payload ->> 'bank_account_id', new.payload ->> 'bank_account_name',
    case when new.payload ->> 'due_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'due_date')::date else null end,
    case when new.payload ->> 'competence_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'competence_date')::date else null end,
    case when new.payload ->> 'billing_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'billing_date')::date else null end,
    case when new.payload ->> 'payment_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'payment_date')::date else null end,
    new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
  ) on conflict (organization_id, legacy_record_id) do update set
    client_legacy_record_id = excluded.client_legacy_record_id, type = excluded.type, title = excluded.title,
    bank_account_legacy_record_id = excluded.bank_account_legacy_record_id,
    cost_center_legacy_record_id = excluded.cost_center_legacy_record_id,
    category_legacy_record_id = excluded.category_legacy_record_id,
    amount = excluded.amount, status = excluded.status, category = excluded.category,
    subcategory_id = excluded.subcategory_id, subcategory_name = excluded.subcategory_name,
    cost_center = excluded.cost_center, bank_account_id = excluded.bank_account_id,
    bank_account_name = excluded.bank_account_name, due_date = excluded.due_date,
    competence_date = excluded.competence_date, billing_date = excluded.billing_date,
    payment_date = excluded.payment_date, notes = excluded.notes, source_payload = excluded.source_payload,
    updated_at = excluded.updated_at;
  return new;
end;
$$;
revoke execute on function public.maestro_sync_relational_financial_entry() from public, anon, authenticated;

-- History trigger must honor an explicit tenant, avoid guessing when multiple
-- organizations exist, and must not be an unrestricted SECURITY DEFINER API.
create or replace function public.maestro_sync_relational_job_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
  v_job_legacy_id text;
  v_job_id uuid;
begin
  if new.entity <> 'JobHistory' then return new; end if;
  select array_agg(distinct m.organization_id) into v_mapped_organizations
  from public.organization_legacy_records m
  where m.legacy_entity = new.entity and m.legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then raise exception 'Job history organization mapping is ambiguous'; end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations o where o.status = 'active';
    if v_active_count <> 1 then return new; end if;
    select o.id into v_organization_id from public.organizations o where o.status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Job history organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_organization_id and o.status = 'active') then
    raise exception 'Job history organization is not active';
  end if;

  v_job_legacy_id := nullif(new.payload ->> 'job_id', '');
  select j.id into v_job_id from public.maestro_jobs j
  where j.organization_id = v_organization_id and j.legacy_record_id = v_job_legacy_id;
  insert into public.organization_legacy_records
    (organization_id, legacy_entity, legacy_record_id, scope_status, source)
  values (v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-job-history-dual-write')
  on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;
  insert into public.maestro_job_history (
    organization_id, legacy_record_id, job_legacy_id, job_id, collaborator_legacy_id,
    event_type, field_name, old_value, new_value, message, source_payload, occurred_at
  ) values (
    v_organization_id, new.record_id, v_job_legacy_id, v_job_id,
    nullif(new.payload ->> 'collaborator_id', ''), nullif(new.payload ->> 'type', ''),
    nullif(new.payload ->> 'field', ''), new.payload ->> 'old_value', new.payload ->> 'new_value',
    new.payload ->> 'text', new.payload, coalesce(new.source_created_at, new.imported_at, pg_catalog.now())
  ) on conflict (organization_id, legacy_record_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.maestro_sync_relational_job_history() from public, anon, authenticated;
