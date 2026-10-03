-- Read-only aggregate comparison for the JobHistory rows affected by the
-- historical 0004 snapshot import. Invoke only against the explicitly
-- confirmed Maestro Dev ref:
--   supabase db query --linked --project-ref tqmfuskvllpqmvayjuqu \
--     --file scripts/sql/audit-migration-0004-jobhistory-drift.sql
-- Never use --linked without the explicit ref or a Production project ref.
-- This emits aggregate counts only, never payloads or record identifiers.

begin read only;
set local statement_timeout = '25s';

do $preflight$
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'Refusing to inspect snapshot drift outside a read-only transaction';
  end if;
  if to_regclass('migration.base44_records') is null
    or to_regclass('public.legacy_records') is null then
    raise exception 'Required snapshot/source relations are unavailable';
  end if;
end;
$preflight$;

with matched as (
  select s.payload as snapshot_payload, l.payload as legacy_payload
  from migration.base44_records s
  join public.legacy_records l
    on l.entity = s.entity_name
   and l.record_id = s.source_id
  where s.entity_name = 'JobHistory'
), normalized as (
  select
    snapshot_payload,
    legacy_payload,
    case
      when pg_catalog.pg_input_is_valid(snapshot_payload ->> 'created_date', 'timestamptz')
      then (snapshot_payload ->> 'created_date')::timestamptz
    end as snapshot_created_at,
    case
      when pg_catalog.pg_input_is_valid(legacy_payload ->> 'created_date', 'timestamptz')
      then (legacy_payload ->> 'created_date')::timestamptz
    end as legacy_created_at,
    case
      when pg_catalog.pg_input_is_valid(snapshot_payload ->> 'updated_date', 'timestamptz')
      then (snapshot_payload ->> 'updated_date')::timestamptz
    end as snapshot_updated_at,
    case
      when pg_catalog.pg_input_is_valid(legacy_payload ->> 'updated_date', 'timestamptz')
      then (legacy_payload ->> 'updated_date')::timestamptz
    end as legacy_updated_at
  from matched
)
select
  'JobHistory'::text as entity,
  count(*) as matched_rows,
  count(*) filter (
    where snapshot_payload ->> 'created_date' is distinct from legacy_payload ->> 'created_date'
  ) as created_date_raw_differences,
  count(*) filter (
    where snapshot_created_at is distinct from legacy_created_at
      and snapshot_created_at is not null and legacy_created_at is not null
  ) as created_date_instant_differences,
  count(*) filter (
    where (snapshot_payload ? 'created_date' and snapshot_created_at is null)
      or (legacy_payload ? 'created_date' and legacy_created_at is null)
  ) as created_date_invalid_values,
  count(*) filter (
    where snapshot_payload ->> 'updated_date' is distinct from legacy_payload ->> 'updated_date'
  ) as updated_date_raw_differences,
  count(*) filter (
    where snapshot_updated_at is distinct from legacy_updated_at
      and snapshot_updated_at is not null and legacy_updated_at is not null
  ) as updated_date_instant_differences,
  count(*) filter (
    where (snapshot_payload ? 'updated_date' and snapshot_updated_at is null)
      or (legacy_payload ? 'updated_date' and legacy_updated_at is null)
  ) as updated_date_invalid_values,
  count(*) filter (
    where snapshot_payload -> 'duration_minutes' is distinct from legacy_payload -> 'duration_minutes'
  ) as duration_minutes_differences,
  count(*) filter (
    where snapshot_payload -> 'old_value' is distinct from legacy_payload -> 'old_value'
  ) as old_value_differences,
  count(*) filter (
    where snapshot_payload -> 'new_value' is distinct from legacy_payload -> 'new_value'
  ) as new_value_differences,
  count(*) filter (
    where snapshot_payload -> 'field' is distinct from legacy_payload -> 'field'
  ) as field_differences,
  count(*) filter (
    where snapshot_payload -> 'type' is distinct from legacy_payload -> 'type'
  ) as type_differences,
  count(*) filter (
    where snapshot_payload -> 'text' is distinct from legacy_payload -> 'text'
  ) as text_differences,
  count(*) filter (
    where snapshot_payload -> 'user' is distinct from legacy_payload -> 'user'
  ) as user_differences,
  count(*) filter (
    where snapshot_payload -> 'collaborator_id' is distinct from legacy_payload -> 'collaborator_id'
  ) as collaborator_id_differences
from normalized;

rollback;
