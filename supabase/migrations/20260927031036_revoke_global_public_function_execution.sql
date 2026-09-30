-- Function EXECUTE is granted to PUBLIC by PostgreSQL's global default.
-- Per-schema revokes cannot remove that global default; harden the owner-level
-- default so new functions require an explicit grant before any API role can
-- call them. This does not change privileges on existing functions.
alter default privileges for role postgres
  revoke execute on functions from public;
