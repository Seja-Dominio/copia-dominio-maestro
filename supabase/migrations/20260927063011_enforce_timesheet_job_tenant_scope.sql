-- Impede que um apontamento relacional seja vinculado a job de outro tenant.
-- Ao apagar o job, preserva o apontamento e seu ID legado como histórico.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_timesheets'::regclass
      and conname = 'maestro_timesheets_org_job_fk'
  ) then
    alter table public.maestro_timesheets
      add constraint maestro_timesheets_org_job_fk
      foreign key (organization_id, job_id)
      references public.maestro_jobs (organization_id, id)
      on delete set null (job_id)
      not valid;
  end if;
end
$$;

alter table public.maestro_timesheets
  validate constraint maestro_timesheets_org_job_fk;
