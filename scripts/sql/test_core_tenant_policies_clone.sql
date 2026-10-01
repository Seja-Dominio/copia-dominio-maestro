-- Synthetic policy-contract test for a disposable schema clone containing
-- the Production core tenant policies. All fixtures and grants are rolled
-- back. Never run against a hosted database.

begin;

do $preflight$
begin
  if exists (
    select 1 from public.organizations
    where id in (
      '00000000-0000-0000-0000-00000c0de001'::uuid,
      '00000000-0000-0000-0000-00000c0de002'::uuid
    )
  ) or exists (
    select 1 from public.maestro_collaborators
    where id in (
      '00000000-0000-0000-0000-00000c0de101',
      '00000000-0000-0000-0000-00000c0de102',
      '00000000-0000-0000-0000-00000c0de103'
    )
  ) then
    raise exception 'Tenant-policy fixture IDs already exist; refusing to run.';
  end if;
  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.maestro_clients'::regclass
  ) then
    raise exception 'Core client relation does not have RLS enabled.';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'maestro_clients'
      and policyname = 'maestro_clients_org_select'
  ) then
    raise exception 'Production tenant-select policy is missing from this clone.';
  end if;
end;
$preflight$;

insert into public.maestro_collaborators (id, login, password_hash, is_active, profile)
values
  ('00000000-0000-0000-0000-00000c0de101', 'policy-a@invalid.test', 'fixture', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-00000c0de102', 'policy-b@invalid.test', 'fixture', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-00000c0de103', 'policy-suspended@invalid.test', 'fixture', true, '{}'::jsonb);

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-0000-0000-00000c0de001', 'Policy Test A', 'policy-test-a'),
  ('00000000-0000-0000-0000-00000c0de002', 'Policy Test B', 'policy-test-b');

insert into public.organization_members (organization_id, collaborator_id, role, status)
values
  ('00000000-0000-0000-0000-00000c0de001', '00000000-0000-0000-0000-00000c0de101', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000c0de002', '00000000-0000-0000-0000-00000c0de102', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000c0de001', '00000000-0000-0000-0000-00000c0de103', 'member', 'suspended');

insert into public.maestro_clients (id, organization_id, legacy_record_id, name)
values
  ('00000000-0000-0000-0000-00000c0de201', '00000000-0000-0000-0000-00000c0de001', 'policy-client-a', 'Policy Client A'),
  ('00000000-0000-0000-0000-00000c0de202', '00000000-0000-0000-0000-00000c0de002', 'policy-client-b', 'Policy Client B');

-- This grant exists only to test the policy directly. The hosted catalog
-- currently does not grant table SELECT to authenticated.
grant select, insert on public.maestro_clients to authenticated;
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000c0de101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000c0de101","role":"authenticated"}', true);
do $tenant_a_select$
begin
  if (select count(*) from public.maestro_clients) <> 1
     or exists (
       select 1 from public.maestro_clients
       where organization_id <> '00000000-0000-0000-0000-00000c0de001'::uuid
     ) then
    raise exception 'Active tenant A did not see exactly its own client.';
  end if;
  if (select count(*) from public.organization_members) <> 1 then
    raise exception 'Membership self-read exposed another collaborator.';
  end if;
  begin
    insert into public.maestro_clients (organization_id, legacy_record_id, name)
    values ('00000000-0000-0000-0000-00000c0de002', 'policy-cross-tenant-insert', 'Denied');
    raise exception 'Cross-tenant client insert unexpectedly succeeded.';
  exception when insufficient_privilege then
    null;
  end;
end;
$tenant_a_select$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000c0de102', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000c0de102","role":"authenticated"}', true);
do $tenant_b_select$
begin
  if (select count(*) from public.maestro_clients) <> 1
     or exists (
       select 1 from public.maestro_clients
       where organization_id <> '00000000-0000-0000-0000-00000c0de002'::uuid
     ) then
    raise exception 'Active tenant B did not see exactly its own client.';
  end if;
end;
$tenant_b_select$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000c0de103', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000c0de103","role":"authenticated"}', true);
do $suspended_member$
begin
  if (select count(*) from public.maestro_clients) <> 0 then
    raise exception 'Suspended membership retained tenant client access.';
  end if;
end;
$suspended_member$;

reset role;
select 'active tenants are isolated, cross-tenant insert is denied, suspended membership sees zero rows' as result;
rollback;
