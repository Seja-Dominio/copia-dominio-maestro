-- Garante que o responsável de uma subtarefa tenha membership no mesmo tenant.
-- A remoção da membership limpa somente o ID e preserva o nome histórico.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_job_tasks'::regclass
      and conname = 'maestro_job_tasks_org_responsible_fk'
  ) then
    alter table public.maestro_job_tasks
      add constraint maestro_job_tasks_org_responsible_fk
      foreign key (organization_id, responsible_id)
      references public.organization_members (organization_id, collaborator_id)
      on delete set null (responsible_id)
      not valid;
  end if;
end
$$;

alter table public.maestro_job_tasks
  validate constraint maestro_job_tasks_org_responsible_fk;
