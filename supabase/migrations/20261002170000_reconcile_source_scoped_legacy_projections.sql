-- Reconcile only the source-scoped legacy rows for which organization_id is
-- already present. This is forward-only: ambiguous, orphaned, pending, or
-- conflicting tenant evidence aborts before any mapping/projection is written.

do $$
begin
  if to_regclass('public.legacy_records') is null
    or to_regclass('public.organization_legacy_records') is null
    or to_regclass('public.organizations') is null
    or to_regclass('public.maestro_notifications') is null
    or to_regclass('public.maestro_nps_history') is null
    or to_regclass('public.maestro_audit_summaries') is null then
    raise exception 'Cannot reconcile legacy projections without all source, tenant, map, and projection tables';
  end if;

  if exists (
    select 1
    from public.legacy_records l
    left join public.organizations o on o.id = l.organization_id
    where l.entity in ('Notification', 'NpsHistory', 'DominusAuditSummary')
      and (l.organization_id is null or o.id is null)
  ) then
    raise exception 'Cannot reconcile legacy projections: source tenant is missing or orphaned';
  end if;

  if exists (
    select 1
    from public.legacy_records l
    join public.organization_legacy_records m
      on m.legacy_entity = l.entity and m.legacy_record_id = l.record_id
    where l.entity in ('Notification', 'NpsHistory', 'DominusAuditSummary')
      and (m.organization_id <> l.organization_id or m.scope_status <> 'confirmed')
  ) then
    raise exception 'Cannot reconcile legacy projections: existing tenant mapping conflicts with source scope or is unconfirmed';
  end if;

  if exists (
    select 1
    from public.legacy_records l
    join public.organization_legacy_records m
      on m.legacy_entity = l.entity and m.legacy_record_id = l.record_id
    where l.entity in ('Notification', 'NpsHistory', 'DominusAuditSummary')
    group by l.entity, l.record_id
    having count(distinct m.organization_id) > 1
  ) then
    raise exception 'Cannot reconcile legacy projections: multiple tenant mappings exist for a source record';
  end if;

  if exists (
    select 1
    from public.legacy_records l
    where l.entity = 'Notification'
      and exists (
        select 1 from public.maestro_notifications p
        where p.legacy_record_id = l.record_id
          and p.organization_id <> l.organization_id
      )
      and not exists (
        select 1 from public.maestro_notifications p
        where p.legacy_record_id = l.record_id
          and p.organization_id = l.organization_id
      )
  ) or exists (
    select 1
    from public.legacy_records l
    join public.maestro_nps_history p on p.legacy_record_id = l.record_id
    where l.entity = 'NpsHistory' and p.organization_id <> l.organization_id
  ) or exists (
    select 1
    from public.legacy_records l
    join public.maestro_audit_summaries p on p.legacy_record_id = l.record_id
    where l.entity = 'DominusAuditSummary' and p.organization_id <> l.organization_id
  ) then
    raise exception 'Cannot reconcile legacy projections: an existing projection belongs to another tenant';
  end if;

  -- Validate casts used below before any writes; CASE branches ensure numeric
  -- parsing is reached only for regex- and range-validated values.
  if exists (
    select 1 from public.legacy_records l
    where l.entity = 'Notification'
      and l.payload ? 'is_read'
      and (l.payload ->> 'is_read' is null
        or lower(l.payload ->> 'is_read') not in ('true', 'false'))
  ) then
    raise exception 'Cannot reconcile notifications: invalid is_read value';
  end if;

  if exists (
    select 1 from public.legacy_records l
    where l.entity = 'NpsHistory'
      and (
        case when l.payload ->> 'delta' ~ '^-?\d+$' then
          case when length(l.payload ->> 'delta') <= 11
            then (l.payload ->> 'delta')::numeric not between -2147483648 and 2147483647
            else true end
        else false end
        or case when l.payload ->> 'score_before' ~ '^-?\d+$' then
          case when length(l.payload ->> 'score_before') <= 11
            then (l.payload ->> 'score_before')::numeric not between -2147483648 and 2147483647
            else true end
        else false end
        or case when l.payload ->> 'score_after' ~ '^-?\d+$' then
          case when length(l.payload ->> 'score_after') <= 11
            then (l.payload ->> 'score_after')::numeric not between -2147483648 and 2147483647
            else true end
        else false end
      )
  ) then
    raise exception 'Cannot reconcile NPS history: integer value is outside the supported range';
  end if;
end;
$$;

insert into public.organization_legacy_records (
  organization_id, legacy_entity, legacy_record_id, scope_status, source
)
select l.organization_id, l.entity, l.record_id, 'confirmed', 'source-organization-reconciliation'
from public.legacy_records l
where l.entity in ('Notification', 'NpsHistory', 'DominusAuditSummary')
  and not exists (
    select 1 from public.organization_legacy_records m
    where m.organization_id = l.organization_id
      and m.legacy_entity = l.entity
      and m.legacy_record_id = l.record_id
  )
on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

insert into public.maestro_notifications (
  organization_id, legacy_record_id, user_id, type, title, message, is_read,
  entity_type, entity_id, source_payload, created_at, updated_at
)
select l.organization_id, l.record_id, l.payload ->> 'user_id', l.payload ->> 'type',
  coalesce(nullif(l.payload ->> 'title', ''), 'Notificação'), l.payload ->> 'message',
  case when lower(coalesce(l.payload ->> 'is_read', 'false')) = 'true' then true else false end,
  l.payload ->> 'entity_type', l.payload ->> 'entity_id', l.payload,
  coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.legacy_records l
join public.organization_legacy_records m
  on m.organization_id = l.organization_id
  and m.legacy_entity = l.entity
  and m.legacy_record_id = l.record_id
where l.entity = 'Notification' and m.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

insert into public.maestro_nps_history (
  legacy_record_id, organization_id, client_legacy_record_id, job_legacy_record_id,
  event_type, delta, score_before, score_after, description, payload,
  source_updated_at, created_at, updated_at
)
select l.record_id, l.organization_id, nullif(l.payload ->> 'client_id', ''),
  nullif(l.payload ->> 'job_id', ''), coalesce(l.payload ->> 'event_type', ''),
  case when l.payload ->> 'delta' ~ '^-?\d+$' then
    case when length(l.payload ->> 'delta') <= 11 then
      case when (l.payload ->> 'delta')::numeric between -2147483648 and 2147483647
        then (l.payload ->> 'delta')::integer else null end
      else null end
    else null end,
  case when l.payload ->> 'score_before' ~ '^-?\d+$' then
    case when length(l.payload ->> 'score_before') <= 11 then
      case when (l.payload ->> 'score_before')::numeric between -2147483648 and 2147483647
        then (l.payload ->> 'score_before')::integer else null end
      else null end
    else null end,
  case when l.payload ->> 'score_after' ~ '^-?\d+$' then
    case when length(l.payload ->> 'score_after') <= 11 then
      case when (l.payload ->> 'score_after')::numeric between -2147483648 and 2147483647
        then (l.payload ->> 'score_after')::integer else null end
      else null end
    else null end,
  coalesce(l.payload ->> 'description', ''), l.payload, l.source_updated_at,
  coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.legacy_records l
join public.organization_legacy_records m
  on m.organization_id = l.organization_id
  and m.legacy_entity = l.entity
  and m.legacy_record_id = l.record_id
where l.entity = 'NpsHistory' and m.scope_status = 'confirmed'
on conflict (legacy_record_id) do nothing;

insert into public.maestro_audit_summaries (
  legacy_record_id, organization_id, summary, audit_payload,
  source_updated_at, created_at, updated_at
)
select l.record_id, l.organization_id,
  coalesce(l.payload ->> 'summary', l.payload ->> 'status', ''), l.payload,
  l.source_updated_at, coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.legacy_records l
join public.organization_legacy_records m
  on m.organization_id = l.organization_id
  and m.legacy_entity = l.entity
  and m.legacy_record_id = l.record_id
where l.entity = 'DominusAuditSummary' and m.scope_status = 'confirmed'
on conflict (legacy_record_id) do nothing;
