-- Reproduce the observed Dev-only event trigger on a disposable Production
-- schema clone. This script intentionally creates a temporary table and
-- trigger inside one transaction; the final ROLLBACK removes all of them.
-- Do not run against any hosted database or a non-disposable local database.

begin;

do $preflight$
begin
  if to_regclass('public.codex_ensure_rls_probe') is not null
     or exists (select 1 from pg_event_trigger where evtname = 'ensure_rls')
     or to_regprocedure('public.rls_auto_enable()') is not null then
    raise exception 'Refusing to overwrite existing event-trigger test objects.';
  end if;
end;
$preflight$;

-- Exact function definition observed in Dev on 30/09/2026. It enables RLS
-- for every newly created table in public; it does not create policies.
create function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
       and cmd.schema_name in ('public')
       and cmd.schema_name not in ('pg_catalog', 'information_schema')
       and cmd.schema_name not like 'pg_toast%'
       and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;

create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();

create table public.codex_ensure_rls_probe (id integer primary key);
insert into public.codex_ensure_rls_probe values (1);

do $event_trigger_assertion$
begin
  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.codex_ensure_rls_probe'::regclass
  ) then
    raise exception 'ensure_rls did not enable RLS for a public table.';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'codex_ensure_rls_probe'
  ) then
    raise exception 'The observed event trigger unexpectedly created an RLS policy.';
  end if;
end;
$event_trigger_assertion$;

grant select on public.codex_ensure_rls_probe to authenticated;
set local role authenticated;
do $default_deny_assertion$
begin
  if (select count(*) from public.codex_ensure_rls_probe) <> 0 then
    raise exception 'RLS without a policy did not default-deny authenticated SELECT.';
  end if;
end;
$default_deny_assertion$;
reset role;

select 'ensure_rls enabled RLS; no policy was created; authenticated SELECT was default-denied' as result;
rollback;
