-- Old browser sessions can still delete through maestro-data's legacy path.
-- Keep the relational projection in sync without touching CXM entities.
create or replace function public.maestro_cleanup_core_relational_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := old.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
begin
  if old.entity not in ('Project', 'Job', 'Subtask', 'FinancialEntry') then return old; end if;
  select array_agg(distinct m.organization_id) into v_mapped_organizations
  from public.organization_legacy_records m
  where m.legacy_entity = old.entity and m.legacy_record_id = old.record_id;
  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'Core delete organization mapping is ambiguous';
  end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations o where o.status = 'active';
    if v_active_count <> 1 then return old; end if;
    select o.id into v_organization_id from public.organizations o where o.status = 'active' limit 1;
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_organization_id and o.status = 'active') then
    raise exception 'Core delete organization is not active';
  end if;

  if old.entity = 'Project' then
    delete from public.maestro_projects p where p.organization_id = v_organization_id and p.legacy_record_id = old.record_id;
  elsif old.entity = 'Job' then
    update public.maestro_job_history h set job_id = null
    where h.organization_id = v_organization_id and h.job_legacy_id = old.record_id;
    delete from public.maestro_jobs j where j.organization_id = v_organization_id and j.legacy_record_id = old.record_id;
  elsif old.entity = 'Subtask' then
    delete from public.maestro_job_tasks t where t.organization_id = v_organization_id and t.legacy_record_id = old.record_id;
  elsif old.entity = 'FinancialEntry' then
    delete from public.maestro_financial_entries f where f.organization_id = v_organization_id and f.legacy_record_id = old.record_id;
  end if;
  return old;
end;
$$;

revoke all on function public.maestro_cleanup_core_relational_delete() from public, anon, authenticated;
grant execute on function public.maestro_cleanup_core_relational_delete() to service_role;

drop trigger if exists legacy_records_core_relational_delete_cleanup on public.legacy_records;
create trigger legacy_records_core_relational_delete_cleanup
after delete on public.legacy_records
for each row execute function public.maestro_cleanup_core_relational_delete();
