-- Reconcile production-shaped installs whose migration ledger advanced while
-- tenant-aware constraints or narrow RPC grants were not applied. Timesheets
-- are optional here because Dev's current baseline lacks the relation; the
-- following 20261001120000 migration creates and validates that projection.

do $$
declare
  v_missing text;
  v_definition text;
begin
  select string_agg(required.name, ', ' order by required.name)
    into v_missing
  from unnest(array[
    'maestro_clients', 'maestro_projects', 'maestro_jobs', 'maestro_job_tasks',
    'maestro_job_history', 'organization_members',
    'job_task_reconciliation'
  ]) as required(name)
  where to_regclass('public.' || required.name) is null;
  if v_missing is not null then
    raise exception 'Cannot reconcile core tenant integrity; required public relations are missing: %', v_missing;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_clients'::regclass and conname='maestro_clients_organization_id_id_key';
  if v_definition is null then
    alter table public.maestro_clients
      add constraint maestro_clients_organization_id_id_key unique (organization_id, id);
  elsif v_definition <> 'UNIQUE (organization_id, id)' then
    raise exception 'Unexpected maestro_clients_organization_id_id_key definition: %', v_definition;
  end if;
  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_projects'::regclass and conname='maestro_projects_organization_id_id_key';
  if v_definition is null then
    alter table public.maestro_projects
      add constraint maestro_projects_organization_id_id_key unique (organization_id, id);
  elsif v_definition <> 'UNIQUE (organization_id, id)' then
    raise exception 'Unexpected maestro_projects_organization_id_id_key definition: %', v_definition;
  end if;
  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_jobs'::regclass and conname='maestro_jobs_organization_id_id_key';
  if v_definition is null then
    alter table public.maestro_jobs
      add constraint maestro_jobs_organization_id_id_key unique (organization_id, id);
  elsif v_definition <> 'UNIQUE (organization_id, id)' then
    raise exception 'Unexpected maestro_jobs_organization_id_id_key definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_projects'::regclass and conname='maestro_projects_org_client_fk';
  if v_definition is null then
    alter table public.maestro_projects add constraint maestro_projects_org_client_fk
      foreign key (organization_id, client_id)
      references public.maestro_clients (organization_id, id)
      on delete set null (client_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, client_id) REFERENCES maestro_clients(organization_id, id)%' then
    raise exception 'Unexpected maestro_projects_org_client_fk definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_jobs'::regclass and conname='maestro_jobs_org_project_fk';
  if v_definition is null then
    alter table public.maestro_jobs add constraint maestro_jobs_org_project_fk
      foreign key (organization_id, project_id)
      references public.maestro_projects (organization_id, id)
      on delete set null (project_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, project_id) REFERENCES maestro_projects(organization_id, id)%' then
    raise exception 'Unexpected maestro_jobs_org_project_fk definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_jobs'::regclass and conname='maestro_jobs_org_client_fk';
  if v_definition is null then
    alter table public.maestro_jobs add constraint maestro_jobs_org_client_fk
      foreign key (organization_id, client_id)
      references public.maestro_clients (organization_id, id)
      on delete set null (client_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, client_id) REFERENCES maestro_clients(organization_id, id)%' then
    raise exception 'Unexpected maestro_jobs_org_client_fk definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_job_tasks'::regclass and conname='maestro_job_tasks_org_job_fk';
  if v_definition is null then
    alter table public.maestro_job_tasks add constraint maestro_job_tasks_org_job_fk
      foreign key (organization_id, job_id)
      references public.maestro_jobs (organization_id, id)
      on delete set null (job_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, job_id) REFERENCES maestro_jobs(organization_id, id)%' then
    raise exception 'Unexpected maestro_job_tasks_org_job_fk definition: %', v_definition;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_job_tasks'::regclass and conname='maestro_job_tasks_org_responsible_fk';
  if v_definition is null then
    alter table public.maestro_job_tasks add constraint maestro_job_tasks_org_responsible_fk
      foreign key (organization_id, responsible_id)
      references public.organization_members (organization_id, collaborator_id)
      on delete set null (responsible_id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, responsible_id) REFERENCES organization_members(organization_id, collaborator_id)%' then
    raise exception 'Unexpected maestro_job_tasks_org_responsible_fk definition: %', v_definition;
  end if;

  if to_regclass('public.maestro_timesheets') is not null then
    select pg_get_constraintdef(oid) into v_definition from pg_constraint
      where conrelid='public.maestro_timesheets'::regclass and conname='maestro_timesheets_org_job_fk';
    if v_definition is null then
      alter table public.maestro_timesheets add constraint maestro_timesheets_org_job_fk
        foreign key (organization_id, job_id)
        references public.maestro_jobs (organization_id, id)
        on delete set null (job_id) not valid;
    elsif v_definition not like 'FOREIGN KEY (organization_id, job_id) REFERENCES maestro_jobs(organization_id, id)%' then
      raise exception 'Unexpected maestro_timesheets_org_job_fk definition: %', v_definition;
    end if;
  end if;

  select pg_get_constraintdef(oid) into v_definition from pg_constraint
    where conrelid='public.maestro_job_history'::regclass and conname='maestro_job_history_job_tenant_fk';
  if v_definition is null then
    alter table public.maestro_job_history drop constraint if exists maestro_job_history_job_id_fkey;
    alter table public.maestro_job_history add constraint maestro_job_history_job_tenant_fk
      foreign key (organization_id, job_id)
      references public.maestro_jobs (organization_id, id) not valid;
  elsif v_definition not like 'FOREIGN KEY (organization_id, job_id) REFERENCES maestro_jobs(organization_id, id)%' then
    raise exception 'Unexpected maestro_job_history_job_tenant_fk definition: %', v_definition;
  end if;
end
$$;

create index if not exists maestro_projects_org_client_id_idx
  on public.maestro_projects (organization_id, client_id);
create index if not exists maestro_jobs_org_project_id_idx
  on public.maestro_jobs (organization_id, project_id);
create index if not exists maestro_jobs_org_client_id_idx
  on public.maestro_jobs (organization_id, client_id);
create index if not exists maestro_job_tasks_org_job_id_idx
  on public.maestro_job_tasks (organization_id, job_id);
create index if not exists maestro_job_tasks_org_responsible_id_idx
  on public.maestro_job_tasks (organization_id, responsible_id);
do $$
begin
  if to_regclass('public.maestro_timesheets') is not null then
    execute 'create index if not exists maestro_timesheets_org_job_id_idx on public.maestro_timesheets (organization_id, job_id)';
  end if;
end
$$;

-- Current Prod contains no cross-tenant links for the available constraints.
-- If Timesheets are absent (the current Dev baseline), their tenant FK and
-- validation are completed by the following forward projection migration.
alter table public.maestro_projects validate constraint maestro_projects_org_client_fk;
alter table public.maestro_jobs validate constraint maestro_jobs_org_project_fk;
alter table public.maestro_jobs validate constraint maestro_jobs_org_client_fk;
alter table public.maestro_job_tasks validate constraint maestro_job_tasks_org_job_fk;
alter table public.maestro_job_history validate constraint maestro_job_history_job_tenant_fk;

do $$
begin
  if to_regclass('public.maestro_timesheets') is not null then
    execute 'alter table public.maestro_timesheets validate constraint maestro_timesheets_org_job_fk';
  end if;
end
$$;

-- Production has 29 existing task assignee references with no membership in
-- the same organization. Keep the constraint NOT VALID until those rows are
-- explicitly reconciled; it still rejects new cross-tenant writes.
revoke all privileges on table public.job_task_reconciliation from service_role;
grant select (id, organization_id, legacy_record_id, resolution_status)
  on public.job_task_reconciliation to service_role;
grant update (resolution_status, resolved_job_id, resolution_note, resolved_at, resolved_by)
  on public.job_task_reconciliation to service_role;
