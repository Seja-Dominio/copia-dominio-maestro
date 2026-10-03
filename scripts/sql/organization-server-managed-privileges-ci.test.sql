-- Read-only verification of the server-managed organization table boundary.
begin read only;

do $assertions$
declare
  relation record;
  privilege_name text;
begin
  for relation in
    select * from (values
      ('organization_legacy_records'::text, false),
      ('organization_members'::text, true),
      ('organization_products'::text, false),
      ('organizations'::text, false)
    ) as targets(table_name, authenticated_self_read)
  loop
    if to_regclass(format('public.%I', relation.table_name)) is null then
      raise exception 'Expected server-managed relation public.% to exist', relation.table_name;
    end if;

    foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    loop
      if has_table_privilege('anon', format('public.%I', relation.table_name), privilege_name) then
        raise exception 'anon has unexpected % on public.%', privilege_name, relation.table_name;
      end if;
      if has_table_privilege('authenticated', format('public.%I', relation.table_name), privilege_name)
        and not (relation.authenticated_self_read and privilege_name = 'SELECT') then
        raise exception 'authenticated has unexpected % on public.%', privilege_name, relation.table_name;
      end if;
    end loop;

    if exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      where c.oid = format('public.%I', relation.table_name)::regclass
        and acl.grantee = 0
    ) then
      raise exception 'PUBLIC has a direct privilege on public.%', relation.table_name;
    end if;
  end loop;

  if has_function_privilege('anon', 'public.maestro_scope_legacy_record()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.maestro_scope_legacy_record()', 'EXECUTE') then
    raise exception 'Browser roles must not call the tenant-scoping trigger function as an RPC';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = 'public.legacy_records'::regclass
      and p.proname = 'maestro_scope_legacy_record'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception 'The tenant-scoping trigger must remain enabled on legacy_records';
  end if;
end;
$assertions$;

select 'organization server-managed ACL and trigger contract passed' as result;
rollback;
