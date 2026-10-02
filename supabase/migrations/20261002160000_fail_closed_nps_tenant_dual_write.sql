-- Keep Insights NPS projections inside the tenant supplied by the caller or
-- the existing legacy identity map. Never guess a tenant when multiple orgs
-- are active, and never move an existing NPS projection between tenants.
do $$
begin
  if to_regclass('public.legacy_records') is null
    or to_regclass('public.organization_legacy_records') is null
    or to_regclass('public.organizations') is null
    or to_regclass('public.maestro_nps_entries') is null
    or to_regclass('public.maestro_nps_history') is null then
    raise exception 'Cannot install fail-closed NPS dual-write without its tenant and projection tables';
  end if;
  if to_regprocedure('public.maestro_sync_nps()') is null
    or not exists (
      select 1 from pg_trigger t
      where t.tgrelid = 'public.legacy_records'::regclass
        and t.tgname = 'legacy_records_nps_sync'
        and t.tgfoid = 'public.maestro_sync_nps()'::regprocedure
        and not t.tgisinternal
    ) then
    raise exception 'Cannot harden NPS dual-write without its installed legacy trigger';
  end if;
end;
$$;

create or replace function public.maestro_sync_nps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_mapped_organizations uuid[];
  v_all_mappings_confirmed boolean;
  v_active_count integer;
begin
  if new.entity not in ('NpsEntry', 'NpsHistory') then return new; end if;

  select array_agg(distinct m.organization_id), bool_and(m.scope_status = 'confirmed')
    into v_mapped_organizations, v_all_mappings_confirmed
  from public.organization_legacy_records m
  where m.legacy_entity = new.entity
    and m.legacy_record_id = new.record_id;

  if cardinality(v_mapped_organizations) > 1 then
    raise exception 'NPS record organization mapping is ambiguous';
  end if;
  if v_organization_id is not null
    and cardinality(v_mapped_organizations) = 1
    and v_mapped_organizations[1] <> v_organization_id then
    raise exception 'NPS record organization scope mismatch';
  end if;
  if v_organization_id is null and cardinality(v_mapped_organizations) = 1 then
    v_organization_id := v_mapped_organizations[1];
  end if;

  -- Retain deterministic single-tenant compatibility for new legacy inserts
  -- only. Existing unmapped history must be explicitly scoped before update.
  if v_organization_id is null and tg_op = 'INSERT' then
    select count(*)::integer into v_active_count
    from public.organizations o where o.status = 'active';
    if v_active_count = 1 then
      select o.id into v_organization_id
      from public.organizations o where o.status = 'active' limit 1;
    elsif v_active_count > 1 then
      raise exception 'NPS record requires an explicit organization in a multi-tenant system';
    end if;
  end if;

  if v_organization_id is null then
    raise exception 'NPS record requires a resolvable organization';
  end if;
  if not exists (
    select 1 from public.organizations o
    where o.id = v_organization_id and o.status = 'active'
  ) then
    raise exception 'NPS record organization is not active';
  end if;
  if v_all_mappings_confirmed is false then
    raise exception 'NPS record tenant mapping is not confirmed';
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'scoped-nps-dual-write'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  if new.entity = 'NpsEntry' then
    if exists (
      select 1 from public.maestro_nps_entries e
      where e.legacy_record_id = new.record_id
        and e.organization_id <> v_organization_id
    ) then
      raise exception 'NPS entry cannot move between organizations';
    end if;
    insert into public.maestro_nps_entries (
      legacy_record_id, organization_id, client_legacy_record_id, month,
      monthly_score, notes, recorded_by, payload, source_updated_at
    ) values (
      new.record_id, v_organization_id, nullif(new.payload ->> 'client_id', ''),
      case when new.payload ->> 'month' ~ '^\d{4}-\d{2}'
        then (new.payload ->> 'month')::date else null end,
      case when new.payload ->> 'monthly_score' ~ '^-?\d+$'
        then (new.payload ->> 'monthly_score')::integer else null end,
      coalesce(new.payload ->> 'notes', ''),
      coalesce(new.payload ->> 'recorded_by', ''), new.payload, new.source_updated_at
    ) on conflict (legacy_record_id) do update set
      client_legacy_record_id = excluded.client_legacy_record_id,
      month = excluded.month, monthly_score = excluded.monthly_score,
      notes = excluded.notes, recorded_by = excluded.recorded_by,
      payload = excluded.payload, source_updated_at = excluded.source_updated_at,
      updated_at = pg_catalog.now();
  else
    if exists (
      select 1 from public.maestro_nps_history h
      where h.legacy_record_id = new.record_id
        and h.organization_id <> v_organization_id
    ) then
      raise exception 'NPS history cannot move between organizations';
    end if;
    insert into public.maestro_nps_history (
      legacy_record_id, organization_id, client_legacy_record_id,
      job_legacy_record_id, event_type, delta, score_before, score_after,
      description, payload, source_updated_at
    ) values (
      new.record_id, v_organization_id, nullif(new.payload ->> 'client_id', ''),
      nullif(new.payload ->> 'job_id', ''), coalesce(new.payload ->> 'event_type', ''),
      case when new.payload ->> 'delta' ~ '^-?\d+$'
        then (new.payload ->> 'delta')::integer else null end,
      case when new.payload ->> 'score_before' ~ '^-?\d+$'
        then (new.payload ->> 'score_before')::integer else null end,
      case when new.payload ->> 'score_after' ~ '^-?\d+$'
        then (new.payload ->> 'score_after')::integer else null end,
      coalesce(new.payload ->> 'description', ''), new.payload, new.source_updated_at
    ) on conflict (legacy_record_id) do update set
      client_legacy_record_id = excluded.client_legacy_record_id,
      job_legacy_record_id = excluded.job_legacy_record_id,
      event_type = excluded.event_type, delta = excluded.delta,
      score_before = excluded.score_before, score_after = excluded.score_after,
      description = excluded.description, payload = excluded.payload,
      source_updated_at = excluded.source_updated_at, updated_at = pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function public.maestro_sync_nps() from public, anon, authenticated;
grant execute on function public.maestro_sync_nps() to service_role;
