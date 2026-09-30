-- Dual-write temporário para subtasks, preservando órfãos como pending.

create or replace function public.maestro_sync_relational_job_task()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_second_organization uuid;
  v_job_id uuid;
begin
  if new.entity <> 'Subtask' then return new; end if;

  select id into v_organization_id from public.organizations
  where status = 'active' order by created_at asc limit 1;
  select id into v_second_organization from public.organizations
  where status = 'active' and id <> v_organization_id limit 1;
  if v_organization_id is null or v_second_organization is not null then return new; end if;

  select j.id into v_job_id from public.maestro_jobs j
  where j.organization_id = v_organization_id
    and j.legacy_record_id = new.payload ->> 'job_id';

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'single-organization-trigger'
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
    case when new.payload ->> 'completed_at' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'completed_at')::timestamptz else null end,
    case when new.payload ->> 'deadline' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'deadline')::date else null end,
    case when new.payload ->> 'order' ~ '^\\d+$' then (new.payload ->> 'order')::integer else null end,
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

drop trigger if exists legacy_records_relational_job_task_sync on public.legacy_records;
create trigger legacy_records_relational_job_task_sync
after insert or update of entity, record_id, payload, source_updated_at
on public.legacy_records
for each row execute function public.maestro_sync_relational_job_task();

revoke execute on function public.maestro_sync_relational_job_task() from public, anon, authenticated;
