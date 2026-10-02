-- Mantém o identificador legado como snapshot e aplica a FK somente ao vínculo tipado.
-- Ao remover membership, limpa o vínculo atual sem apagar a atribuição histórica.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.maestro_mini_tasks'::regclass
      and conname = 'maestro_mini_tasks_org_collaborator_fk'
  ) then
    alter table public.maestro_mini_tasks
      add constraint maestro_mini_tasks_org_collaborator_fk
      foreign key (organization_id, collaborator_id)
      references public.organization_members (organization_id, collaborator_id)
      on delete set null (collaborator_id)
      not valid;
  end if;
end
$$;

alter table public.maestro_mini_tasks
  validate constraint maestro_mini_tasks_org_collaborator_fk;
