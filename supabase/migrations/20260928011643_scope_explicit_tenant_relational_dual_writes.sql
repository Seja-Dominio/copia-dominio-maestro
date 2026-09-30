-- Respect the organization already attached to each legacy row. Several
-- compatibility writers previously selected the oldest active organization
-- and silently skipped rows as soon as a second tenant was enabled.

create or replace function public.maestro_sync_relational_job_task()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
  v_job_id uuid;
begin
  if new.entity <> 'Subtask' then return new; end if;

  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;

  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Subtask organization mapping is ambiguous';
  end if;
  if v_organization_id is null then
    v_organization_id := v_mapped_organizations[1];
  end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count
    from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id
    from public.organizations where status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Subtask organization scope mismatch';
  end if;
  if not exists (
    select 1 from public.organizations
    where id = v_organization_id and status = 'active'
  ) then
    raise exception 'Subtask organization is not active';
  end if;

  select j.id into v_job_id
  from public.maestro_jobs j
  where j.organization_id = v_organization_id
      and j.legacy_record_id = new.payload ->> 'job_id';
  if v_job_id is null and nullif(new.payload ->> 'job_id', '') is not null then
    raise exception 'Subtask job must belong to the same organization';
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-subtask-dual-write'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_job_tasks (
    organization_id, legacy_record_id, legacy_job_record_id, job_id, title, status,
    is_completed, completed_at, deadline, task_order, responsible_id, responsible_name,
    resolution_status, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'job_id', v_job_id,
    coalesce(nullif(new.payload ->> 'title', ''), 'Tarefa sem título'),
    new.payload ->> 'status',
    case when new.payload ? 'is_completed' then (new.payload ->> 'is_completed')::boolean else null end,
    case when new.payload ->> 'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'completed_at')::timestamptz else null end,
    case when new.payload ->> 'deadline' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'deadline')::date else null end,
    case when new.payload ->> 'order' ~ '^[0-9]+$' then (new.payload ->> 'order')::integer else null end,
    new.payload ->> 'responsible_id', new.payload ->> 'responsible_name',
    case when v_job_id is null then 'pending' else 'linked' end,
    new.payload, coalesce(new.source_updated_at, now())
  )
  on conflict (organization_id, legacy_record_id) do update set
    legacy_job_record_id = excluded.legacy_job_record_id,
    job_id = excluded.job_id,
    title = excluded.title,
    status = excluded.status,
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at,
    deadline = excluded.deadline,
    task_order = excluded.task_order,
    responsible_id = excluded.responsible_id,
    responsible_name = excluded.responsible_name,
    resolution_status = excluded.resolution_status,
    source_payload = excluded.source_payload,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.maestro_sync_relational_agenda_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
begin
  if new.entity <> 'AgendaEvent' then return new; end if;

  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Agenda event organization mapping is ambiguous';
  end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Agenda event organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'Agenda event organization is not active';
  end if;

  if nullif(new.payload ->> 'client_id', '') is not null and not exists (
    select 1 from public.maestro_clients c
    where c.organization_id = v_organization_id and c.legacy_record_id = new.payload ->> 'client_id'
  ) then raise exception 'Agenda event client must belong to the same organization'; end if;
  if nullif(new.payload ->> 'collaborator_id', '') is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_organization_id and m.collaborator_id = new.payload ->> 'collaborator_id'
  ) then raise exception 'Agenda event collaborator must belong to the same organization'; end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-agenda-dual-write'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_agenda_events (
    organization_id, legacy_record_id, client_legacy_record_id, title, event_date,
    start_time, end_time, status, activity_type, collaborator_id, collaborator_name,
    notes, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'client_id',
    coalesce(nullif(new.payload ->> 'title', ''), 'Evento sem título'),
    case when new.payload ->> 'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'date')::date else null end,
    case when new.payload ->> 'time' ~ '^[0-9]{2}:[0-9]{2}' then (new.payload ->> 'time')::time else null end,
    case when new.payload ->> 'end_time' ~ '^[0-9]{2}:[0-9]{2}' then (new.payload ->> 'end_time')::time else null end,
    new.payload ->> 'status', new.payload ->> 'activity_type', new.payload ->> 'collaborator_id',
    new.payload ->> 'collaborator_name', new.payload ->> 'notes', new.payload,
    coalesce(new.source_updated_at, now())
  )
  on conflict (organization_id, legacy_record_id) do update set
    client_legacy_record_id = excluded.client_legacy_record_id,
    title = excluded.title, event_date = excluded.event_date, start_time = excluded.start_time,
    end_time = excluded.end_time, status = excluded.status, activity_type = excluded.activity_type,
    collaborator_id = excluded.collaborator_id, collaborator_name = excluded.collaborator_name,
    notes = excluded.notes, source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.maestro_sync_relational_timesheet()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
  v_job_id uuid;
begin
  if new.entity <> 'Timesheet' then return new; end if;

  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Timesheet organization mapping is ambiguous';
  end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Timesheet organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'Timesheet organization is not active';
  end if;

  select j.id into v_job_id
  from public.maestro_jobs j
  where j.organization_id = v_organization_id
    and j.legacy_record_id = new.payload ->> 'job_id';
  if v_job_id is null and nullif(new.payload ->> 'job_id', '') is not null then
    raise exception 'Timesheet job must belong to the same organization';
  end if;
  if nullif(new.payload ->> 'collaborator_id', '') is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_organization_id and m.collaborator_id = new.payload ->> 'collaborator_id'
  ) then raise exception 'Timesheet collaborator must belong to the same organization'; end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-timesheet-dual-write'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_timesheets (
    organization_id, legacy_record_id, legacy_job_record_id, job_id, client_legacy_record_id,
    project_legacy_record_id, collaborator_id, collaborator_name, job_title, status,
    is_running, is_rework, started_at, ended_at, duration_minutes, notes, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'job_id', v_job_id,
    new.payload ->> 'client_id', new.payload ->> 'project_id', new.payload ->> 'collaborator_id',
    new.payload ->> 'collaborator_name', new.payload ->> 'job_title', new.payload ->> 'status',
    case when new.payload ? 'is_running' then (new.payload ->> 'is_running')::boolean else null end,
    case when new.payload ? 'is_rework' then (new.payload ->> 'is_rework')::boolean else null end,
    case when new.payload ->> 'started_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'started_at')::timestamptz else null end,
    case when new.payload ->> 'ended_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'ended_at')::timestamptz else null end,
    case when new.payload ->> 'duration_minutes' ~ '^[0-9]+$' then (new.payload ->> 'duration_minutes')::integer else null end,
    new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at, now())
  )
  on conflict (organization_id, legacy_record_id) do update set
    legacy_job_record_id = excluded.legacy_job_record_id, job_id = excluded.job_id,
    client_legacy_record_id = excluded.client_legacy_record_id,
    project_legacy_record_id = excluded.project_legacy_record_id,
    collaborator_id = excluded.collaborator_id, collaborator_name = excluded.collaborator_name,
    job_title = excluded.job_title, status = excluded.status, is_running = excluded.is_running,
    is_rework = excluded.is_rework, started_at = excluded.started_at, ended_at = excluded.ended_at,
    duration_minutes = excluded.duration_minutes, notes = excluded.notes,
    source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function public.maestro_sync_relational_notification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
begin
  if new.entity <> 'Notification' then return new; end if;

  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Notification organization mapping is ambiguous';
  end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Notification organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'Notification organization is not active';
  end if;
  if nullif(new.payload ->> 'user_id', '') is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = v_organization_id and m.collaborator_id = new.payload ->> 'user_id'
  ) then raise exception 'Notification recipient must belong to the same organization'; end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-notification-dual-write'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  insert into public.maestro_notifications (
    organization_id, legacy_record_id, user_id, type, title, message, is_read,
    entity_type, entity_id, source_payload, updated_at
  ) values (
    v_organization_id, new.record_id, new.payload ->> 'user_id', new.payload ->> 'type',
    coalesce(nullif(new.payload ->> 'title', ''), 'Notificação'), new.payload ->> 'message',
    case when new.payload ? 'is_read' then (new.payload ->> 'is_read')::boolean else false end,
    new.payload ->> 'entity_type', new.payload ->> 'entity_id', new.payload,
    coalesce(new.source_updated_at, now())
  )
  on conflict (organization_id, legacy_record_id) do update set
    user_id = excluded.user_id, type = excluded.type, title = excluded.title,
    message = excluded.message, is_read = excluded.is_read,
    entity_type = excluded.entity_type, entity_id = excluded.entity_id,
    source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  return new;
end;
$$;

-- Preserve date values when dual-writing. The historical regex escaped `d`
-- twice inside a PostgreSQL string, so valid ISO dates never matched.
create or replace function public.maestro_sync_relational_financial_entry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
begin
  if new.entity <> 'FinancialEntry' then return new; end if;
  select array_agg(distinct organization_id) into v_mapped_organizations
  from public.organization_legacy_records
  where legacy_entity = new.entity and legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Financial entry organization mapping is ambiguous';
  end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then return new; end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Financial entry organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'Financial entry organization is not active';
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-financial-entry-dual-write'
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
    case when new.payload ->> 'due_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'due_date')::date else null end,
    case when new.payload ->> 'competence_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'competence_date')::date else null end,
    case when new.payload ->> 'billing_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'billing_date')::date else null end,
    case when new.payload ->> 'payment_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'payment_date')::date else null end,
    new.payload ->> 'notes', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
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

-- Retain the existing typed Client/Project/Job links while correcting ISO date parsing.
create or replace function public.maestro_sync_relational_work_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_active_count integer;
  v_client_id uuid;
  v_project_id uuid;
begin
  if new.entity not in ('Client', 'Project', 'Job') then return new; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;
  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'legacy record organization is not active';
  end if;
  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'tenant-aware-relational-trigger'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  if new.entity = 'Client' then
    insert into public.maestro_clients (
      organization_id, legacy_record_id, name, company_name, status, email, phone, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id,
      coalesce(nullif(new.payload ->> 'name', ''), nullif(new.payload ->> 'company_name', ''), 'Cliente sem nome'),
      new.payload ->> 'company_name', new.payload ->> 'status', new.payload ->> 'email', new.payload ->> 'phone',
      new.payload, coalesce(new.source_updated_at, pg_catalog.now())
    ) on conflict (organization_id, legacy_record_id) do update set
      name=excluded.name, company_name=excluded.company_name, status=excluded.status,
      email=excluded.email, phone=excluded.phone, source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  elsif new.entity = 'Project' then
    select c.id into v_client_id from public.maestro_clients c
    where c.organization_id = v_organization_id and c.legacy_record_id = new.payload ->> 'client_id';
    insert into public.maestro_projects (
      organization_id, legacy_record_id, client_legacy_record_id, client_id, name, status, reference_month, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id, new.payload ->> 'client_id', v_client_id,
      coalesce(nullif(new.payload ->> 'name', ''), 'Projeto sem nome'), new.payload ->> 'status',
      new.payload ->> 'reference_month', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
    ) on conflict (organization_id, legacy_record_id) do update set
      client_legacy_record_id=excluded.client_legacy_record_id, client_id=excluded.client_id, name=excluded.name,
      status=excluded.status, reference_month=excluded.reference_month,
      source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  elsif new.entity = 'Job' then
    select p.id into v_project_id from public.maestro_projects p
    where p.organization_id = v_organization_id and p.legacy_record_id = new.payload ->> 'project_id';
    select c.id into v_client_id from public.maestro_clients c
    where c.organization_id = v_organization_id and c.legacy_record_id = new.payload ->> 'client_id';
    insert into public.maestro_jobs (
      organization_id, legacy_record_id, project_legacy_record_id, project_id, client_legacy_record_id, client_id,
      title, status, content_type, post_date, briefing, caption, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id, new.payload ->> 'project_id', v_project_id, new.payload ->> 'client_id', v_client_id,
      coalesce(nullif(new.payload ->> 'title', ''), 'Job sem título'), new.payload ->> 'status', new.payload ->> 'content_type',
      case when new.payload ->> 'post_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'post_date')::date else null end,
      new.payload ->> 'briefing', new.payload ->> 'caption', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
    ) on conflict (organization_id, legacy_record_id) do update set
      project_legacy_record_id=excluded.project_legacy_record_id, project_id=excluded.project_id,
      client_legacy_record_id=excluded.client_legacy_record_id, client_id=excluded.client_id, title=excluded.title,
      status=excluded.status, content_type=excluded.content_type, post_date=excluded.post_date,
      briefing=excluded.briefing, caption=excluded.caption, source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.maestro_sync_relational_financial_entry() from public, anon, authenticated;
revoke execute on function public.maestro_sync_relational_work_core() from public, anon, authenticated;

revoke execute on function public.maestro_sync_relational_job_task() from public, anon, authenticated;
revoke execute on function public.maestro_sync_relational_agenda_event() from public, anon, authenticated;
revoke execute on function public.maestro_sync_relational_timesheet() from public, anon, authenticated;
revoke execute on function public.maestro_sync_relational_notification() from public, anon, authenticated;
