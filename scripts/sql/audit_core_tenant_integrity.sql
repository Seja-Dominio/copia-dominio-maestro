-- Read-only preflight for the Client/Project/Job/Subtask core.
-- Run separately on Dev, a production-shaped clone, and (only when approved)
-- Production. Returns aggregate counts and catalog metadata, never row payloads.
begin read only;

with relation_audit as (
  select
    'Project.client'::text as relationship,
    count(*) filter (where p.client_id is not null and not exists (
      select 1 from public.maestro_clients c
      where c.id=p.client_id and c.organization_id=p.organization_id
    )) as typed_links_without_same_tenant_parent,
    count(*) filter (where p.client_id is not null and nullif(p.client_legacy_record_id,'') is not null and exists (
      select 1 from public.maestro_clients c
      where c.id=p.client_id and c.organization_id=p.organization_id
        and c.legacy_record_id is distinct from p.client_legacy_record_id
    )) as typed_legacy_identity_mismatch,
    count(*) filter (where p.client_id is null and nullif(p.client_legacy_record_id,'') is not null and exists (
      select 1 from public.maestro_clients c
      where c.organization_id=p.organization_id and c.legacy_record_id=p.client_legacy_record_id
    )) as legacy_pointer_same_tenant_but_untyped,
    count(*) filter (where p.client_id is null and nullif(p.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.maestro_clients c where c.organization_id=p.organization_id and c.legacy_record_id=p.client_legacy_record_id)
      and exists (select 1 from public.maestro_clients c where c.organization_id<>p.organization_id and c.legacy_record_id=p.client_legacy_record_id)
    ) as legacy_pointer_resolves_only_elsewhere,
    count(*) filter (where p.client_id is null and nullif(p.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.maestro_clients c where c.legacy_record_id=p.client_legacy_record_id)
    ) as legacy_pointer_unresolved,
    count(*) filter (where nullif(p.client_legacy_record_id,'') is not null and exists (
      select 1 from public.legacy_records l where l.entity='Client'
        and l.record_id=p.client_legacy_record_id and l.organization_id=p.organization_id
    )) as raw_parent_same_tenant,
    count(*) filter (where nullif(p.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Client'
        and l.record_id=p.client_legacy_record_id and l.organization_id=p.organization_id)
      and exists (select 1 from public.legacy_records l where l.entity='Client'
        and l.record_id=p.client_legacy_record_id and l.organization_id is distinct from p.organization_id)
    ) as raw_parent_other_or_unscoped_only,
    count(*) filter (where nullif(p.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Client' and l.record_id=p.client_legacy_record_id)
    ) as raw_parent_missing
  from public.maestro_projects p
  union all
  select
    'Job.project',
    count(*) filter (where j.project_id is not null and not exists (
      select 1 from public.maestro_projects p
      where p.id=j.project_id and p.organization_id=j.organization_id
    )),
    count(*) filter (where j.project_id is not null and nullif(j.project_legacy_record_id,'') is not null and exists (
      select 1 from public.maestro_projects p
      where p.id=j.project_id and p.organization_id=j.organization_id
        and p.legacy_record_id is distinct from j.project_legacy_record_id
    )),
    count(*) filter (where j.project_id is null and nullif(j.project_legacy_record_id,'') is not null and exists (
      select 1 from public.maestro_projects p
      where p.organization_id=j.organization_id and p.legacy_record_id=j.project_legacy_record_id
    )),
    count(*) filter (where j.project_id is null and nullif(j.project_legacy_record_id,'') is not null
      and not exists (select 1 from public.maestro_projects p where p.organization_id=j.organization_id and p.legacy_record_id=j.project_legacy_record_id)
      and exists (select 1 from public.maestro_projects p where p.organization_id<>j.organization_id and p.legacy_record_id=j.project_legacy_record_id)
    ),
    count(*) filter (where j.project_id is null and nullif(j.project_legacy_record_id,'') is not null
      and not exists (select 1 from public.maestro_projects p where p.legacy_record_id=j.project_legacy_record_id)
    ),
    count(*) filter (where nullif(j.project_legacy_record_id,'') is not null and exists (
      select 1 from public.legacy_records l where l.entity='Project'
        and l.record_id=j.project_legacy_record_id and l.organization_id=j.organization_id
    )),
    count(*) filter (where nullif(j.project_legacy_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Project'
        and l.record_id=j.project_legacy_record_id and l.organization_id=j.organization_id)
      and exists (select 1 from public.legacy_records l where l.entity='Project'
        and l.record_id=j.project_legacy_record_id and l.organization_id is distinct from j.organization_id)
    ),
    count(*) filter (where nullif(j.project_legacy_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Project' and l.record_id=j.project_legacy_record_id)
    )
  from public.maestro_jobs j
  union all
  select
    'Job.client',
    count(*) filter (where j.client_id is not null and not exists (
      select 1 from public.maestro_clients c
      where c.id=j.client_id and c.organization_id=j.organization_id
    )),
    count(*) filter (where j.client_id is not null and nullif(j.client_legacy_record_id,'') is not null and exists (
      select 1 from public.maestro_clients c
      where c.id=j.client_id and c.organization_id=j.organization_id
        and c.legacy_record_id is distinct from j.client_legacy_record_id
    )),
    count(*) filter (where j.client_id is null and nullif(j.client_legacy_record_id,'') is not null and exists (
      select 1 from public.maestro_clients c
      where c.organization_id=j.organization_id and c.legacy_record_id=j.client_legacy_record_id
    )),
    count(*) filter (where j.client_id is null and nullif(j.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.maestro_clients c where c.organization_id=j.organization_id and c.legacy_record_id=j.client_legacy_record_id)
      and exists (select 1 from public.maestro_clients c where c.organization_id<>j.organization_id and c.legacy_record_id=j.client_legacy_record_id)
    ),
    count(*) filter (where j.client_id is null and nullif(j.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.maestro_clients c where c.legacy_record_id=j.client_legacy_record_id)
    ),
    count(*) filter (where nullif(j.client_legacy_record_id,'') is not null and exists (
      select 1 from public.legacy_records l where l.entity='Client'
        and l.record_id=j.client_legacy_record_id and l.organization_id=j.organization_id
    )),
    count(*) filter (where nullif(j.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Client'
        and l.record_id=j.client_legacy_record_id and l.organization_id=j.organization_id)
      and exists (select 1 from public.legacy_records l where l.entity='Client'
        and l.record_id=j.client_legacy_record_id and l.organization_id is distinct from j.organization_id)
    ),
    count(*) filter (where nullif(j.client_legacy_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Client' and l.record_id=j.client_legacy_record_id)
    )
  from public.maestro_jobs j
  union all
  select
    'Subtask.job',
    count(*) filter (where t.job_id is not null and not exists (
      select 1 from public.maestro_jobs j
      where j.id=t.job_id and j.organization_id=t.organization_id
    )),
    count(*) filter (where t.job_id is not null and nullif(t.legacy_job_record_id,'') is not null and exists (
      select 1 from public.maestro_jobs j
      where j.id=t.job_id and j.organization_id=t.organization_id
        and j.legacy_record_id is distinct from t.legacy_job_record_id
    )),
    count(*) filter (where t.job_id is null and nullif(t.legacy_job_record_id,'') is not null and exists (
      select 1 from public.maestro_jobs j
      where j.organization_id=t.organization_id and j.legacy_record_id=t.legacy_job_record_id
    )),
    count(*) filter (where t.job_id is null and nullif(t.legacy_job_record_id,'') is not null
      and not exists (select 1 from public.maestro_jobs j where j.organization_id=t.organization_id and j.legacy_record_id=t.legacy_job_record_id)
      and exists (select 1 from public.maestro_jobs j where j.organization_id<>t.organization_id and j.legacy_record_id=t.legacy_job_record_id)
    ),
    count(*) filter (where t.job_id is null and nullif(t.legacy_job_record_id,'') is not null
      and not exists (select 1 from public.maestro_jobs j where j.legacy_record_id=t.legacy_job_record_id)
    ),
    count(*) filter (where nullif(t.legacy_job_record_id,'') is not null and exists (
      select 1 from public.legacy_records l where l.entity='Job'
        and l.record_id=t.legacy_job_record_id and l.organization_id=t.organization_id
    )),
    count(*) filter (where nullif(t.legacy_job_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Job'
        and l.record_id=t.legacy_job_record_id and l.organization_id=t.organization_id)
      and exists (select 1 from public.legacy_records l where l.entity='Job'
        and l.record_id=t.legacy_job_record_id and l.organization_id is distinct from t.organization_id)
    ),
    count(*) filter (where nullif(t.legacy_job_record_id,'') is not null
      and not exists (select 1 from public.legacy_records l where l.entity='Job' and l.record_id=t.legacy_job_record_id)
    )
  from public.maestro_job_tasks t
), expected(table_name, constraint_name, constraint_type) as (
  values
    ('maestro_clients','maestro_clients_organization_id_id_key','u'),
    ('maestro_projects','maestro_projects_organization_id_id_key','u'),
    ('maestro_jobs','maestro_jobs_organization_id_id_key','u'),
    ('maestro_projects','maestro_projects_org_client_fk','f'),
    ('maestro_jobs','maestro_jobs_org_project_fk','f'),
    ('maestro_jobs','maestro_jobs_org_client_fk','f'),
    ('maestro_job_tasks','maestro_job_tasks_org_job_fk','f')
), audit_rows as (
  select 0 as sort_key, 'transaction'::text as section,
    jsonb_build_object('transaction_read_only', current_setting('transaction_read_only')) as result
  union all
  select 1, 'relationship', to_jsonb(r)
  from relation_audit r
  union all
  select 2, 'constraint', jsonb_build_object(
    'table_name', e.table_name,
    'constraint_name', e.constraint_name,
    'present', c.oid is not null,
    'validated', coalesce(c.convalidated,false),
    'definition', case when c.oid is null then null else pg_catalog.pg_get_constraintdef(c.oid) end
  )
  from expected e
  left join pg_catalog.pg_class r on r.relnamespace='public'::regnamespace and r.relname=e.table_name
  left join pg_catalog.pg_constraint c on c.conrelid=r.oid and c.conname=e.constraint_name and c.contype=e.constraint_type
  union all
  select 3, 'rls', to_jsonb(catalog_row)
  from (
    select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
    from pg_catalog.pg_class c
    where c.relnamespace='public'::regnamespace
      and c.relname in ('maestro_clients','maestro_projects','maestro_jobs','maestro_job_tasks')
  ) catalog_row
)
select section, result
from audit_rows
order by sort_key, section, result::text;

rollback;
