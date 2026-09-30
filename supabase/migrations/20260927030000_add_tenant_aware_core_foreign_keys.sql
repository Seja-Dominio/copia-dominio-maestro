-- Impede que relações do núcleo atravessem organizações, mantendo os FKs
-- antigos durante a fase expand. Constraints NOT VALID protegem novas escritas;
-- dados existentes serão validados em migration separada após o teste isolado.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maestro_clients_organization_id_id_key'
      and conrelid = 'public.maestro_clients'::regclass
  ) then
    alter table public.maestro_clients
      add constraint maestro_clients_organization_id_id_key unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maestro_projects_organization_id_id_key'
      and conrelid = 'public.maestro_projects'::regclass
  ) then
    alter table public.maestro_projects
      add constraint maestro_projects_organization_id_id_key unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maestro_jobs_organization_id_id_key'
      and conrelid = 'public.maestro_jobs'::regclass
  ) then
    alter table public.maestro_jobs
      add constraint maestro_jobs_organization_id_id_key unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maestro_projects_org_client_fk'
      and conrelid = 'public.maestro_projects'::regclass
  ) then
    alter table public.maestro_projects
      add constraint maestro_projects_org_client_fk
      foreign key (organization_id, client_id)
      references public.maestro_clients (organization_id, id)
      on delete set null (client_id) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maestro_jobs_org_project_fk'
      and conrelid = 'public.maestro_jobs'::regclass
  ) then
    alter table public.maestro_jobs
      add constraint maestro_jobs_org_project_fk
      foreign key (organization_id, project_id)
      references public.maestro_projects (organization_id, id)
      on delete set null (project_id) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maestro_jobs_org_client_fk'
      and conrelid = 'public.maestro_jobs'::regclass
  ) then
    alter table public.maestro_jobs
      add constraint maestro_jobs_org_client_fk
      foreign key (organization_id, client_id)
      references public.maestro_clients (organization_id, id)
      on delete set null (client_id) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maestro_job_tasks_org_job_fk'
      and conrelid = 'public.maestro_job_tasks'::regclass
  ) then
    alter table public.maestro_job_tasks
      add constraint maestro_job_tasks_org_job_fk
      foreign key (organization_id, job_id)
      references public.maestro_jobs (organization_id, id)
      on delete set null (job_id) not valid;
  end if;
end $$;

create index if not exists maestro_projects_org_client_id_idx
  on public.maestro_projects (organization_id, client_id);
create index if not exists maestro_jobs_org_project_id_idx
  on public.maestro_jobs (organization_id, project_id);
create index if not exists maestro_jobs_org_client_id_idx
  on public.maestro_jobs (organization_id, client_id);
create index if not exists maestro_job_tasks_org_job_id_idx
  on public.maestro_job_tasks (organization_id, job_id);
