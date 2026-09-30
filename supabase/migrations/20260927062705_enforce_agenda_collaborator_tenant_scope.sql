-- Garante que o responsável de um evento pertença à mesma organização.
-- Preserva collaborator_name como snapshot quando a membership for removida.
create index if not exists maestro_agenda_events_org_collaborator_idx
  on public.maestro_agenda_events (organization_id, collaborator_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_agenda_events'::regclass
      and conname = 'maestro_agenda_events_org_collaborator_fk'
  ) then
    alter table public.maestro_agenda_events
      add constraint maestro_agenda_events_org_collaborator_fk
      foreign key (organization_id, collaborator_id)
      references public.organization_members (organization_id, collaborator_id)
      on delete set null (collaborator_id)
      not valid;
  end if;
end
$$;

alter table public.maestro_agenda_events
  validate constraint maestro_agenda_events_org_collaborator_fk;
