-- Repair fields preserved in source_payload but not projected by the original
-- Timesheet migration (its \d regular expressions are not portable in SQL).
-- Only fills relational NULLs and leaves the original source snapshot intact.
update public.maestro_timesheets
set duration_minutes = (source_payload ->> 'duration_minutes')::integer
where duration_minutes is null
  and source_payload ->> 'duration_minutes' ~ '^[0-9]{1,10}$'
  and (source_payload ->> 'duration_minutes')::numeric <= 2147483647;

update public.maestro_timesheets
set started_at = (source_payload ->> 'started_at')::timestamptz
where started_at is null
  and pg_input_is_valid(source_payload ->> 'started_at', 'timestamp with time zone');

update public.maestro_timesheets
set ended_at = (source_payload ->> 'ended_at')::timestamptz
where ended_at is null
  and pg_input_is_valid(source_payload ->> 'ended_at', 'timestamp with time zone');
