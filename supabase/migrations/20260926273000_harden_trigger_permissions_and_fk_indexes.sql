-- Trigger functions are not API endpoints. Keep them callable only by the
-- database trigger executor/service role.
revoke all on function public.maestro_scope_legacy_record() from public, anon, authenticated;
revoke all on function public.maestro_sync_relational_job_history() from public, anon, authenticated;
revoke all on function public.maestro_sync_relational_webhook_receipt() from public, anon, authenticated;

-- Cover every relational foreign key reported by the performance advisor.
create index if not exists maestro_job_history_job_fk_idx
  on public.maestro_job_history (job_id);
create index if not exists maestro_job_tasks_job_fk_idx
  on public.maestro_job_tasks (job_id);
create index if not exists maestro_jobs_project_fk_idx
  on public.maestro_jobs (project_id);
create index if not exists maestro_jobs_client_fk_idx
  on public.maestro_jobs (client_id);
create index if not exists maestro_projects_client_fk_idx
  on public.maestro_projects (client_id);
create index if not exists maestro_timesheets_job_fk_idx
  on public.maestro_timesheets (job_id);
