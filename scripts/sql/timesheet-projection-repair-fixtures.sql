-- Synthetic rollback-only fixtures for 20260930140000_repair_timesheet_payload_projection.
begin;

do $preflight$
begin
  if exists (select 1 from public.organizations where id='00000000-0000-0000-0000-00000000c001'::uuid)
     or exists (select 1 from public.maestro_timesheets where organization_id='00000000-0000-0000-0000-00000000c001'::uuid) then
    raise exception 'Timesheet repair fixture IDs already exist; refusing to run.';
  end if;
end;
$preflight$;

insert into public.organizations (id, name, slug, status)
values ('00000000-0000-0000-0000-00000000c001', 'Timesheet repair CI', 'timesheet-repair-ci', 'active');

insert into public.maestro_timesheets (
  organization_id, legacy_record_id, duration_minutes, started_at, ended_at, source_payload
)
values
  ('00000000-0000-0000-0000-00000000c001', 'timesheet-repair-valid', null, null, null,
   '{"duration_minutes":"45","started_at":"2026-10-01T09:00:00Z","ended_at":"2026-10-01T09:45:00Z"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c001', 'timesheet-repair-invalid-duration', null, null, null,
   '{"duration_minutes":"2147483648","started_at":"not-a-timestamp","ended_at":"not-a-timestamp"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c001', 'timesheet-repair-partial', null, null, null,
   '{"duration_minutes":"30","started_at":"not-a-timestamp","ended_at":"2026-10-01T10:30:00Z"}'::jsonb),
  ('00000000-0000-0000-0000-00000000c001', 'timesheet-repair-preserve', 5,
   '2026-10-01T08:00:00Z', '2026-10-01T08:05:00Z',
   '{"duration_minutes":"99","started_at":"2026-10-01T09:00:00Z","ended_at":"2026-10-01T10:39:00Z"}'::jsonb);
