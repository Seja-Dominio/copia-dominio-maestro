do $assertions$
begin
  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id='00000000-0000-0000-0000-00000000c001'::uuid
      and legacy_record_id='timesheet-repair-valid'
      and duration_minutes=45
      and started_at='2026-10-01T09:00:00Z'::timestamptz
      and ended_at='2026-10-01T09:45:00Z'::timestamptz
  ) then raise exception 'Valid source fields were not projected.'; end if;

  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id='00000000-0000-0000-0000-00000000c001'::uuid
      and legacy_record_id='timesheet-repair-invalid-duration'
      and duration_minutes is null and started_at is null and ended_at is null
  ) then raise exception 'Invalid or overflowing source fields should remain null.'; end if;

  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id='00000000-0000-0000-0000-00000000c001'::uuid
      and legacy_record_id='timesheet-repair-partial'
      and duration_minutes=30 and started_at is null
      and ended_at='2026-10-01T10:30:00Z'::timestamptz
  ) then raise exception 'Valid fields should project when a sibling field is invalid.'; end if;

  if not exists (
    select 1 from public.maestro_timesheets
    where organization_id='00000000-0000-0000-0000-00000000c001'::uuid
      and legacy_record_id='timesheet-repair-preserve'
      and duration_minutes=5
      and started_at='2026-10-01T08:00:00Z'::timestamptz
      and ended_at='2026-10-01T08:05:00Z'::timestamptz
  ) then raise exception 'The repair must not overwrite already populated fields.'; end if;
end;
$assertions$;
