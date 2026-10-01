-- Synthetic upgrade fixture: creates historically invalid references, then
-- applies the reconciliation migration between the two barriers below.
begin;
do $preflight$
begin
  if exists (select 1 from public.organizations where id in (
      '00000000-0000-0000-0000-00000000c001'::uuid,
      '00000000-0000-0000-0000-00000000d001'::uuid
    ))
    or exists (select 1 from public.maestro_jobs where legacy_record_id in (
      'tenant-ci-relink-job', 'tenant-ci-cross-tenant-job'
    ))
    or exists (select 1 from public.maestro_jobs where legacy_record_id like 'tenant-ci-scale-job-%')
    or exists (select 1 from public.maestro_job_tasks where legacy_record_id in (
      'tenant-ci-relink-task', 'tenant-ci-missing-parent-task', 'tenant-ci-missing-assignee-task',
      'tenant-ci-cross-tenant-task'
    ))
    or exists (select 1 from public.maestro_job_tasks where legacy_record_id like 'tenant-ci-parent-loss-task-%'
      or legacy_record_id like 'tenant-ci-linked-task-%'
      or legacy_record_id like 'tenant-ci-relational-only-%')
    or exists (select 1 from public.relational_integrity_exceptions where organization_id = '00000000-0000-0000-0000-00000000c001'::uuid) then
    raise exception 'Subtask reconciliation fixture collision; refusing to run';
  end if;
end;
$preflight$;

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-0000-0000-00000000c001', 'Subtask Link CI', 'subtask-link-ci'),
  ('00000000-0000-0000-0000-00000000d001', 'Subtask Link Other Tenant', 'subtask-link-other');
insert into public.maestro_jobs (id, organization_id, legacy_record_id, title)
values
  ('00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-00000000c001', 'tenant-ci-relink-job', 'Subtask Link CI Job'),
  ('00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-00000000d001', 'tenant-ci-cross-tenant-job', 'Other Tenant Job');
insert into public.maestro_jobs (id, organization_id, legacy_record_id, title)
select
  md5('tenant-ci-scale-job-' || job_no::text)::uuid,
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'tenant-ci-scale-job-' || job_no::text,
  'Synthetic scale Job ' || job_no::text
from generate_series(1, 100) as job_no;

-- Simulate old rows that predate FK enforcement. The constraints are restored
-- as NOT VALID before the migration under test is run.
alter table public.maestro_job_tasks drop constraint maestro_job_tasks_org_responsible_fk;
insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id,
  title, responsible_id, responsible_name, resolution_status, source_payload
) values
  ('00000000-0000-0000-0000-00000000c001', 'tenant-ci-relink-task', 'tenant-ci-relink-job', null,
    'Exact parent candidate', null, null, 'linked', '{"job_id":"tenant-ci-relink-job"}'),
  ('00000000-0000-0000-0000-00000000c001', 'tenant-ci-missing-parent-task', 'tenant-ci-job-not-found', null,
    'Missing parent', null, null, 'linked', '{"job_id":"tenant-ci-job-not-found"}'),
  ('00000000-0000-0000-0000-00000000c001', 'tenant-ci-cross-tenant-task', 'tenant-ci-cross-tenant-job', null,
    'Cross-tenant parent candidate', null, null, 'linked', '{"job_id":"tenant-ci-cross-tenant-job"}'),
  ('00000000-0000-0000-0000-00000000c001', 'tenant-ci-missing-assignee-task', 'tenant-ci-relink-job',
    '00000000-0000-0000-0000-00000000c401', 'Historical assignee', '00000000-0000-0000-0000-00000000c999',
    'Former teammate', 'linked', '{"job_id":"tenant-ci-relink-job","responsible_id":"00000000-0000-0000-0000-00000000c999","responsible_name":"Former teammate"}');
insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id,
  title, resolution_status, source_payload
)
select
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'tenant-ci-parent-loss-task-' || task_no::text,
  'tenant-ci-parent-loss-job-' || (((task_no - 1) % 96) + 1)::text,
  null,
  'Synthetic missing parent task ' || task_no::text,
  'linked',
  jsonb_build_object('job_id', 'tenant-ci-parent-loss-job-' || (((task_no - 1) % 96) + 1)::text)
from generate_series(1, 496) as task_no;
-- Synthetic cardinality twin of the observed production cutover shape:
-- 6,606 of 7,102 legacy-backed tasks already linked, plus the 496 above;
-- 170 of 290 relational-only tasks linked, 114 exact candidates, six absent.
insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id,
  title, resolution_status, source_payload
)
select
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'tenant-ci-linked-task-' || task_no::text,
  'tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text,
  md5('tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text)::uuid,
  'Synthetic linked task ' || task_no::text,
  'linked',
  jsonb_build_object('job_id', 'tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text)
from generate_series(1, 6606) as task_no;
insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id,
  title, resolution_status, source_payload
)
select
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'tenant-ci-relational-only-linked-' || task_no::text,
  'tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text,
  md5('tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text)::uuid,
  'Synthetic relational-only linked task ' || task_no::text,
  'linked',
  jsonb_build_object('job_id', 'tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text)
from generate_series(1, 170) as task_no;
insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id,
  title, resolution_status, source_payload
)
select
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'tenant-ci-relational-only-relink-' || task_no::text,
  'tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text,
  null,
  'Synthetic exact-relink task ' || task_no::text,
  'linked',
  jsonb_build_object('job_id', 'tenant-ci-scale-job-' || (((task_no - 1) % 100) + 1)::text)
from generate_series(1, 114) as task_no;
insert into public.maestro_job_tasks (
  organization_id, legacy_record_id, legacy_job_record_id, job_id,
  title, resolution_status, source_payload
)
select
  '00000000-0000-0000-0000-00000000c001'::uuid,
  'tenant-ci-relational-only-missing-' || task_no::text,
  'tenant-ci-relational-only-absent-job-' || task_no::text,
  null,
  'Synthetic absent-parent task ' || task_no::text,
  'linked',
  jsonb_build_object('job_id', 'tenant-ci-relational-only-absent-job-' || task_no::text)
from generate_series(1, 6) as task_no;
alter table public.maestro_job_tasks
  add constraint maestro_job_tasks_org_responsible_fk
  foreign key (organization_id, responsible_id)
  references public.organization_members (organization_id, collaborator_id)
  on delete set null (responsible_id) not valid;

-- MIGRATION_BARRIER: apply 20261001140000_reconcile_core_subtask_links.sql here.

do $assertions$
declare
  v_job_id uuid;
begin
  select id into v_job_id from public.maestro_jobs
  where organization_id = '00000000-0000-0000-0000-00000000c001'::uuid
    and legacy_record_id = 'tenant-ci-relink-job';
  if not exists (
    select 1 from public.maestro_job_tasks
    where legacy_record_id = 'tenant-ci-relink-task' and job_id = v_job_id and resolution_status = 'linked'
  ) then raise exception 'Exact same-tenant parent was not relinked'; end if;
  if not exists (
    select 1 from public.maestro_job_tasks
      where legacy_record_id = 'tenant-ci-missing-parent-task' and job_id is null and resolution_status = 'pending'
  ) or not exists (
    select 1 from public.relational_integrity_exceptions
    where entity = 'Subtask' and legacy_record_id = 'tenant-ci-missing-parent-task'
      and issue_type = 'missing_job_parent' and resolution_status = 'pending'
  ) then raise exception 'Missing parent was not preserved and staged for review'; end if;
  if not exists (
    select 1 from public.maestro_job_tasks
    where legacy_record_id = 'tenant-ci-cross-tenant-task' and organization_id = '00000000-0000-0000-0000-00000000c001'::uuid
      and job_id is null and resolution_status = 'pending'
  ) or exists (
    select 1 from public.maestro_job_tasks t
    join public.maestro_jobs j on j.id = t.job_id
    where t.legacy_record_id = 'tenant-ci-cross-tenant-task' and j.organization_id <> t.organization_id
  ) then raise exception 'Migration linked a task to another tenant Job'; end if;
  if (select count(*) from public.maestro_job_tasks
      where legacy_record_id like 'tenant-ci-parent-loss-task-%'
        and job_id is null and resolution_status = 'pending'
        and legacy_job_record_id = source_payload ->> 'job_id') <> 496
    or (select count(*) from public.relational_integrity_exceptions
      where entity = 'Subtask' and issue_type = 'missing_job_parent'
        and resolution_status = 'pending'
        and legacy_record_id like 'tenant-ci-parent-loss-task-%') <> 496 then
    raise exception 'Scaled missing-parent cohort was not preserved and staged exactly once';
  end if;
  if (select count(*) from public.maestro_job_tasks t
      join public.maestro_jobs j on j.organization_id = t.organization_id and j.id = t.job_id
      where t.legacy_record_id like 'tenant-ci-relational-only-relink-%'
        and j.legacy_record_id = t.legacy_job_record_id and t.resolution_status = 'linked') <> 114
    or (select count(*) from public.relational_integrity_exceptions
      where entity = 'Subtask' and issue_type = 'missing_job_parent'
        and resolution_status = 'pending'
        and legacy_record_id like 'tenant-ci-relational-only-missing-%') <> 6 then
    raise exception 'Production-shape relational-only parent cohort did not relink/stage as expected';
  end if;
  if (select count(*) from public.maestro_job_tasks
      where legacy_record_id like 'tenant-ci-linked-task-%') <> 6606
    or (select count(*) from public.maestro_job_tasks
      where legacy_record_id like 'tenant-ci-relational-only-linked-%'
        and job_id is not null and resolution_status = 'linked') <> 170 then
    raise exception 'Already-linked production-shape cohort changed unexpectedly';
  end if;
  if not exists (
    select 1 from public.maestro_job_tasks
    where legacy_record_id = 'tenant-ci-missing-assignee-task'
      and responsible_id is null and responsible_name = 'Former teammate'
      and source_payload -> 'responsible_id' = 'null'::jsonb
  ) or not exists (
    select 1 from public.relational_integrity_exceptions
    where entity = 'Subtask' and legacy_record_id = 'tenant-ci-missing-assignee-task'
      and issue_type = 'missing_assignee_membership' and resolution_status = 'pending'
      and payload ->> 'historical_responsible_id' = '00000000-0000-0000-0000-00000000c999'
  ) then raise exception 'Orphan assignee was not sanitized with its historical snapshot preserved'; end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_job_tasks'::regclass
      and conname in ('maestro_job_tasks_org_job_fk', 'maestro_job_tasks_org_responsible_fk')
    group by conrelid having count(*) = 2 and bool_and(convalidated)
  ) then raise exception 'Task tenant-aware foreign keys were not validated'; end if;
  if exists (
    select 1 from public.legacy_records
    where record_id in ('tenant-ci-relink-task', 'tenant-ci-missing-parent-task', 'tenant-ci-missing-assignee-task', 'tenant-ci-cross-tenant-task')
  ) then raise exception 'Relational reconciliation unexpectedly wrote legacy_records'; end if;
end;
$assertions$;

do $recovery$
begin
  perform public.maestro_write_frozen_core_with_history(
    '00000000-0000-0000-0000-00000000c001'::uuid,
    'Job',
    'create',
    'tenant-ci-parent-loss-job-1',
    '{"id":"tenant-ci-parent-loss-job-1","title":"Recovered exact-key Job"}'::jsonb,
    'tenant-ci-recovery-actor',
    'CI Recovery Actor'
  );

  if (select count(*) from public.maestro_job_tasks t
      join public.maestro_jobs j on j.organization_id = t.organization_id and j.id = t.job_id
      where t.legacy_job_record_id = 'tenant-ci-parent-loss-job-1'
        and j.legacy_record_id = 'tenant-ci-parent-loss-job-1'
        and t.job_id = j.id and t.resolution_status = 'linked') <> 6
    or (select count(*) from public.relational_integrity_exceptions e
      join public.maestro_job_tasks t on t.organization_id = e.organization_id and t.legacy_record_id = e.legacy_record_id
      where t.legacy_job_record_id = 'tenant-ci-parent-loss-job-1'
        and e.entity = 'Subtask' and e.issue_type = 'missing_job_parent'
        and e.resolution_status = 'resolved') <> 6 then
    raise exception 'Same-ID Job recovery did not relink and resolve its exact same-tenant subtasks';
  end if;
end;
$recovery$;

rollback;
