-- Repair only deterministic same-tenant Job links. Preserve unresolved history
-- and assignee display labels while recording exceptions for later review.
do $$
declare
  v_job_fk text;
  v_responsible_fk text;
begin
  if to_regclass('public.maestro_job_tasks') is null
    or to_regclass('public.maestro_jobs') is null
    or to_regclass('public.organization_members') is null
    or to_regclass('public.relational_integrity_exceptions') is null then
    raise exception 'Subtask reconciliation prerequisites are missing';
  end if;

  select pg_catalog.pg_get_constraintdef(oid) into v_job_fk
  from pg_catalog.pg_constraint
  where conrelid = 'public.maestro_job_tasks'::regclass
    and conname = 'maestro_job_tasks_org_job_fk';
  select pg_catalog.pg_get_constraintdef(oid) into v_responsible_fk
  from pg_catalog.pg_constraint
  where conrelid = 'public.maestro_job_tasks'::regclass
    and conname = 'maestro_job_tasks_org_responsible_fk';
  if v_job_fk is null or v_job_fk not like 'FOREIGN KEY (organization_id, job_id) REFERENCES maestro_jobs(organization_id, id)%' then
    raise exception 'Expected tenant-aware Job foreign key is missing or has changed';
  end if;
  if v_responsible_fk is null or v_responsible_fk not like 'FOREIGN KEY (organization_id, responsible_id) REFERENCES organization_members(organization_id, collaborator_id)%' then
    raise exception 'Expected tenant-aware assignee foreign key is missing or has changed';
  end if;

  -- Do not silently replace a non-null relation that conflicts with its
  -- stable legacy key. Such a row needs explicit investigation first.
  if exists (
    select 1
    from public.maestro_job_tasks t
    left join public.maestro_jobs j
      on j.organization_id = t.organization_id and j.id = t.job_id
    where t.job_id is not null
      and t.legacy_job_record_id is not null
      and (j.id is null or j.legacy_record_id <> t.legacy_job_record_id)
  ) then
    raise exception 'Subtask reconciliation found a conflicting non-null Job relation';
  end if;
  if exists (
    select 1
    from public.maestro_job_tasks t
    where nullif(t.legacy_job_record_id, '') is not null
      and nullif(t.source_payload ->> 'job_id', '') is not null
      and t.source_payload ->> 'job_id' <> t.legacy_job_record_id
  ) then
    raise exception 'Subtask reconciliation found conflicting historical and relational Job keys';
  end if;
  if exists (
    select 1 from public.maestro_job_tasks t
    where t.responsible_id is not null
      and pg_catalog.jsonb_typeof(t.source_payload) <> 'object'
  ) then
    raise exception 'Subtask reconciliation cannot preserve a non-object source payload';
  end if;
end;
$$;

-- Exact legacy parent key plus same organization is the only automatic
-- relink rule. Archived/ignored status is preserved; pending links become linked.
update public.maestro_job_tasks t
set job_id = j.id,
    resolution_status = case when t.resolution_status = 'pending' then 'linked' else t.resolution_status end,
    updated_at = pg_catalog.clock_timestamp()
from public.maestro_jobs j
where t.job_id is null
  and nullif(t.legacy_job_record_id, '') is not null
  and j.organization_id = t.organization_id
  and j.legacy_record_id = t.legacy_job_record_id;

-- Keep unmatched parent references visible as pending integrity exceptions;
-- source_payload and legacy_job_record_id remain unchanged for later review.
insert into public.relational_integrity_exceptions (
  organization_id, entity, legacy_record_id, issue_type, payload
)
select t.organization_id, 'Subtask', t.legacy_record_id, 'missing_job_parent',
  pg_catalog.jsonb_build_object(
    'legacy_job_record_id', t.legacy_job_record_id,
    'source_payload_retained', true
  )
from public.maestro_job_tasks t
where t.job_id is null
  and nullif(t.legacy_job_record_id, '') is not null
  and not exists (
    select 1 from public.maestro_jobs j
    where j.organization_id = t.organization_id
      and j.legacy_record_id = t.legacy_job_record_id
  )
on conflict (organization_id, entity, legacy_record_id, issue_type) do nothing;

update public.maestro_job_tasks t
set resolution_status = 'pending',
    updated_at = pg_catalog.clock_timestamp()
where t.job_id is null
  and nullif(t.legacy_job_record_id, '') is not null
  and t.resolution_status = 'linked'
  and not exists (
    select 1 from public.maestro_jobs j
    where j.organization_id = t.organization_id
      and j.legacy_record_id = t.legacy_job_record_id
  );

-- Preserve the historical display name and ID in the exception, while the
-- task's current projection stops treating the stale ID as an assignment.
insert into public.relational_integrity_exceptions (
  organization_id, entity, legacy_record_id, issue_type, payload
)
select t.organization_id, 'Subtask', t.legacy_record_id, 'missing_assignee_membership',
  pg_catalog.jsonb_build_object(
    'historical_responsible_id', t.responsible_id,
    'responsible_name', t.responsible_name,
    'source_payload_retained', true
  )
from public.maestro_job_tasks t
where t.responsible_id is not null
  and not exists (
    select 1 from public.organization_members m
    where m.organization_id = t.organization_id
      and m.collaborator_id = t.responsible_id
  )
on conflict (organization_id, entity, legacy_record_id, issue_type) do nothing;

update public.maestro_job_tasks t
set responsible_id = null,
    source_payload = pg_catalog.jsonb_set(t.source_payload, '{responsible_id}', 'null'::jsonb, true),
    updated_at = pg_catalog.clock_timestamp()
where t.responsible_id is not null
  and not exists (
    select 1 from public.organization_members m
    where m.organization_id = t.organization_id
      and m.collaborator_id = t.responsible_id
  );

-- The constraints already reject new cross-tenant references. Validate them
-- only after deterministic repair and exception staging have completed.
alter table public.maestro_job_tasks
  validate constraint maestro_job_tasks_org_job_fk;
alter table public.maestro_job_tasks
  validate constraint maestro_job_tasks_org_responsible_fk;
