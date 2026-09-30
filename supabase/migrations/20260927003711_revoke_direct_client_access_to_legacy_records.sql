-- All application data access goes through authenticated Edge Functions.
-- Do not expose the legacy payload store to browser Supabase Auth sessions.
drop policy if exists legacy_records_authenticated_read on public.legacy_records;
revoke all privileges on table public.legacy_records from anon, authenticated;
