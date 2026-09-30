-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Prevent
-- future public-schema functions from becoming callable until their API
-- contract has an explicit grant; server functions can grant service_role.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
