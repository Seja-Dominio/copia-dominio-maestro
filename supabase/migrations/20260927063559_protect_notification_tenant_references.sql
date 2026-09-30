-- Validate newly introduced notification references without invalidating
-- historical rows whose recipient or job has since been removed.
create or replace function public.maestro_validate_notification_tenant_references()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id then
    if new.user_id is not null and not exists (
      select 1
      from public.organization_members m
      where m.organization_id = new.organization_id
        and m.collaborator_id = new.user_id
    ) then
      raise check_violation using
        message = 'Notification recipient must belong to the same organization';
    end if;
  end if;

  if (tg_op = 'INSERT'
      or new.organization_id is distinct from old.organization_id
      or new.entity_type is distinct from old.entity_type
      or new.entity_id is distinct from old.entity_id)
     and new.entity_type = 'job'
     and nullif(new.entity_id, '') is not null
     and not exists (
       select 1
       from public.maestro_jobs j
       where j.organization_id = new.organization_id
         and j.legacy_record_id = new.entity_id
     ) then
    raise check_violation using
      message = 'Notification job reference must belong to the same organization';
  end if;

  return new;
end;
$$;

revoke all on function public.maestro_validate_notification_tenant_references()
  from public, anon, authenticated;

drop trigger if exists maestro_notifications_validate_tenant_references
  on public.maestro_notifications;
create trigger maestro_notifications_validate_tenant_references
  before insert or update of organization_id, user_id, entity_type, entity_id
  on public.maestro_notifications
  for each row
  execute function public.maestro_validate_notification_tenant_references();
