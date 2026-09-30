-- Fortalece os vínculos internos sem remover IDs legados usados pelo frontend.

alter table public.maestro_projects
  add column if not exists client_id uuid;

alter table public.maestro_jobs
  add column if not exists project_id uuid,
  add column if not exists client_id uuid;

update public.maestro_projects p
set client_id = c.id
from public.maestro_clients c
where p.client_id is null
  and p.organization_id = c.organization_id
  and nullif(p.client_legacy_record_id, '') = c.legacy_record_id;

update public.maestro_jobs j
set project_id = p.id
from public.maestro_projects p
where j.organization_id = p.organization_id
  and j.project_id is null
  and nullif(j.project_legacy_record_id, '') = p.legacy_record_id;

update public.maestro_jobs j
set client_id = c.id
from public.maestro_clients c
where j.organization_id = c.organization_id
  and j.client_id is null
  and nullif(j.client_legacy_record_id, '') = c.legacy_record_id;

alter table public.maestro_projects
  drop constraint if exists maestro_projects_client_fk;
alter table public.maestro_projects
  add constraint maestro_projects_client_fk
  foreign key (client_id) references public.maestro_clients(id) on delete set null;

alter table public.maestro_jobs
  drop constraint if exists maestro_jobs_project_fk;
alter table public.maestro_jobs
  add constraint maestro_jobs_project_fk
  foreign key (project_id) references public.maestro_projects(id) on delete set null;

alter table public.maestro_jobs
  drop constraint if exists maestro_jobs_client_fk;
alter table public.maestro_jobs
  add constraint maestro_jobs_client_fk
  foreign key (client_id) references public.maestro_clients(id) on delete set null;

create index if not exists maestro_projects_org_client_id_idx
  on public.maestro_projects (organization_id, client_id);
create index if not exists maestro_jobs_org_project_id_idx
  on public.maestro_jobs (organization_id, project_id);
create index if not exists maestro_jobs_org_client_id_idx
  on public.maestro_jobs (organization_id, client_id);
