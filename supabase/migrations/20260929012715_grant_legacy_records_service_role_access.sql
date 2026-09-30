-- The legacy payload store is server-managed. Keep Edge Functions operational
-- without exposing the table to anon/authenticated Data API clients.
grant select, insert, update, delete on table public.legacy_records to service_role;
