-- The Maestro browser talks to authenticated Edge Functions; it does not use
-- the Data API for public tables. RLS does not protect TRUNCATE, REFERENCES,
-- or TRIGGER privileges, so keep table access server-managed by default.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

-- The only intentional direct table read is a collaborator's own membership,
-- protected by organization_members_self_read. This is also needed by the
-- minimal Auth session integration; product/domain access stays in Edge APIs.
grant select on table public.organization_members to authenticated;

-- Supabase currently has defaults for both migration owners. Prevent future
-- public tables/sequences from silently reopening the Data API surface while
-- preserving service_role defaults for server-side Edge Functions.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
