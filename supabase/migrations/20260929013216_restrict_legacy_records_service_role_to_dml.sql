revoke all privileges on table public.legacy_records from service_role;
grant select, insert, update, delete on table public.legacy_records to service_role;
