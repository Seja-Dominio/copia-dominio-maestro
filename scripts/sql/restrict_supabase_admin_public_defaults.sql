-- Run only as supabase_admin. The ordinary migration role cannot alter
-- another role's default ACLs, and role memberships are reserved to superusers.
-- Keep this as an explicit project-bootstrap operation, not a schema migration.
do $guard$
begin
  if current_user <> 'supabase_admin' then
    raise exception 'Run this bootstrap only as supabase_admin; current_user=%', current_user;
  end if;
end;
$guard$;

alter default privileges for role supabase_admin in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all privileges on sequences from public, anon, authenticated;
-- PostgreSQL grants function EXECUTE to PUBLIC globally by default; a
-- schema-scoped revoke cannot remove that global default.
alter default privileges for role supabase_admin
  revoke execute on functions from public;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public, anon, authenticated;
