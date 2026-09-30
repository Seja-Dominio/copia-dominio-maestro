-- Executar após a migration expand em branch isolada e triagem de violações.
-- A validação examina os registros atuais; não altera os vínculos.
alter table public.maestro_projects
  validate constraint maestro_projects_org_client_fk;

alter table public.maestro_jobs
  validate constraint maestro_jobs_org_project_fk;

alter table public.maestro_jobs
  validate constraint maestro_jobs_org_client_fk;

alter table public.maestro_job_tasks
  validate constraint maestro_job_tasks_org_job_fk;
