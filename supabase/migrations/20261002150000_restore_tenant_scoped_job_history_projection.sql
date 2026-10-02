-- Restore the strict tenant-aware JobHistory projection if a historical
-- migration ledger left a weaker function body installed.
do $guard$
begin
  if current_setting('transaction_read_only') = 'on' then
    raise exception 'Cannot restore JobHistory projection in a read-only transaction';
  end if;
  if to_regclass('public.legacy_records') is null
    or to_regclass('public.organization_legacy_records') is null
    or to_regclass('public.organizations') is null
    or to_regclass('public.maestro_jobs') is null
    or to_regclass('public.maestro_job_history') is null then
    raise exception 'Required tenant-aware JobHistory projection relations are missing';
  end if;
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'legacy_records'
      and t.tgfoid = to_regprocedure('public.maestro_sync_relational_job_history()')
      and not t.tgisinternal and t.tgenabled <> 'D'
  ) then
    raise exception 'Active JobHistory projection trigger is missing';
  end if;
end;
$guard$;

create or replace function public.maestro_sync_relational_job_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_active_count integer;
  v_job_legacy_id text;
  v_job_id uuid;
begin
  if new.entity <> 'JobHistory' then return new; end if;
  select array_agg(distinct m.organization_id) into v_mapped_organizations
  from public.organization_legacy_records m
  where m.legacy_entity = new.entity and m.legacy_record_id = new.record_id;
  if cardinality(v_mapped_organizations) > 1 then raise exception 'Job history organization mapping is ambiguous'; end if;
  if v_organization_id is null then v_organization_id := v_mapped_organizations[1]; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations o where o.status = 'active';
    if v_active_count <> 1 then return new; end if;
    select o.id into v_organization_id from public.organizations o where o.status = 'active' limit 1;
  end if;
  if new.organization_id is not null and new.organization_id <> v_organization_id then
    raise exception 'Job history organization scope mismatch';
  end if;
  if not exists (select 1 from public.organizations o where o.id = v_organization_id and o.status = 'active') then
    raise exception 'Job history organization is not active';
  end if;

  v_job_legacy_id := nullif(new.payload ->> 'job_id', '');
  select j.id into v_job_id from public.maestro_jobs j
  where j.organization_id = v_organization_id and j.legacy_record_id = v_job_legacy_id;
  if v_job_legacy_id is not null and v_job_id is null then
    raise foreign_key_violation using message = 'Job history job must belong to the same organization';
  end if;
  insert into public.organization_legacy_records
    (organization_id, legacy_entity, legacy_record_id, scope_status, source)
  values (v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-job-history-dual-write')
  on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;
  insert into public.maestro_job_history (
    organization_id, legacy_record_id, job_legacy_id, job_id, collaborator_legacy_id,
    event_type, field_name, old_value, new_value, message, source_payload, occurred_at
  ) values (
    v_organization_id, new.record_id, v_job_legacy_id, v_job_id,
    nullif(new.payload ->> 'collaborator_id', ''), nullif(new.payload ->> 'type', ''),
    nullif(new.payload ->> 'field', ''), new.payload ->> 'old_value', new.payload ->> 'new_value',
    new.payload ->> 'text', new.payload, coalesce(new.source_created_at, new.imported_at, pg_catalog.now())
  ) on conflict (organization_id, legacy_record_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.maestro_sync_relational_job_history()
  from public, anon, authenticated;
