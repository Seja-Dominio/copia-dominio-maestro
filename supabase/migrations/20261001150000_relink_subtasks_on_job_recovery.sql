-- A deleted Job keeps its Subtasks with a nullable FK and a stable legacy key.
-- When Recovery recreates the Job with that same ID, restore only exact
-- same-tenant links and resolve their staged missing-parent exceptions.
create or replace function public.maestro_relink_subtasks_after_job_recovery()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if nullif(new.legacy_record_id, '') is null then
    return new;
  end if;

  with relinked as (
    update public.maestro_job_tasks t
    set job_id = new.id,
        resolution_status = case when t.resolution_status = 'pending' then 'linked' else t.resolution_status end,
        updated_at = v_now
    where t.organization_id = new.organization_id
      and t.job_id is null
      and t.legacy_job_record_id = new.legacy_record_id
      and (
        nullif(t.source_payload ->> 'job_id', '') is null
        or t.source_payload ->> 'job_id' = new.legacy_record_id
      )
    returning t.organization_id, t.legacy_record_id
  )
  update public.relational_integrity_exceptions e
  set resolution_status = 'resolved',
      resolution_note = 'Job recuperado com o mesmo ID; subtarefa religada por tenant e chave exata.',
      resolved_at = v_now
  where e.organization_id = new.organization_id
    and e.entity = 'Subtask'
    and e.issue_type = 'missing_job_parent'
    and e.resolution_status = 'pending'
    and exists (
      select 1 from relinked r
      where r.organization_id = e.organization_id
        and r.legacy_record_id = e.legacy_record_id
    );

  return new;
end;
$$;

revoke all on function public.maestro_relink_subtasks_after_job_recovery() from public, anon, authenticated;
grant execute on function public.maestro_relink_subtasks_after_job_recovery() to service_role;
grant update (resolution_status, resolution_note, resolved_at)
  on public.relational_integrity_exceptions to service_role;

drop trigger if exists maestro_jobs_relink_subtasks_after_recovery on public.maestro_jobs;
create trigger maestro_jobs_relink_subtasks_after_recovery
after insert on public.maestro_jobs
for each row execute function public.maestro_relink_subtasks_after_job_recovery();
