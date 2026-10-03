-- Verify objects created as supabase_admin in public do not inherit client
-- privileges. All probe objects are rolled back with this transaction.
begin;

do $preflight$
begin
  if to_regclass('public.maestro_default_acl_probe') is not null
    or to_regclass('public.maestro_default_acl_probe_seq') is not null
    or to_regprocedure('public.maestro_default_acl_probe_fn()') is not null then
    raise exception 'Default-privilege probe objects already exist; refusing to run';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    raise exception 'supabase_admin role is required for this contract test';
  end if;
end;
$preflight$;

set local role supabase_admin;
create table public.maestro_default_acl_probe (id integer);
create sequence public.maestro_default_acl_probe_seq;
create function public.maestro_default_acl_probe_fn()
returns integer language sql as 'select 1';
reset role;

do $assertions$
declare
  v_client_oids oid[];
begin
  select array[0::oid, anon.oid, authenticated.oid]
  into v_client_oids
  from pg_roles anon cross join pg_roles authenticated
  where anon.rolname = 'anon' and authenticated.rolname = 'authenticated';

  if v_client_oids is null then
    raise exception 'anon/authenticated roles are required for this contract test';
  end if;

  if exists (
    select 1 from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid = 'public.maestro_default_acl_probe'::regclass
      and acl.grantee = any(v_client_oids)
  ) then
    raise exception 'New public table inherited a client/PUBLIC privilege';
  end if;
  if exists (
    select 1 from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) acl
    where c.oid = 'public.maestro_default_acl_probe_seq'::regclass
      and acl.grantee = any(v_client_oids)
  ) then
    raise exception 'New public sequence inherited a client/PUBLIC privilege';
  end if;
  if exists (
    select 1 from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = 'public.maestro_default_acl_probe_fn()'::regprocedure
      and acl.grantee = any(v_client_oids)
  ) then
    raise exception 'New public function inherited a client/PUBLIC privilege';
  end if;

  if not has_table_privilege('service_role', 'public.maestro_default_acl_probe', 'SELECT')
    or not has_table_privilege('service_role', 'public.maestro_default_acl_probe', 'INSERT')
    or not has_sequence_privilege('service_role', 'public.maestro_default_acl_probe_seq', 'USAGE')
    or not has_function_privilege('service_role', 'public.maestro_default_acl_probe_fn()', 'EXECUTE') then
    raise exception 'New public objects lost the expected service_role defaults';
  end if;
  if not has_table_privilege('authenticated', 'public.organization_members', 'SELECT') then
    raise exception 'The explicit organization_members self-read grant was removed';
  end if;
end;
$assertions$;

rollback;
