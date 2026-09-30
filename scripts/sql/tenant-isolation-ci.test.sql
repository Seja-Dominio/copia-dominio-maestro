-- Synthetic, transaction-only tenant/RLS contracts for the clean-room CI DB.
-- All fixtures and temporary grants are reverted by the final ROLLBACK.
begin;

do $preflight$
begin
  if exists (
    select 1 from public.organizations
    where id in (
      '00000000-0000-0000-0000-00000000a001'::uuid,
      '00000000-0000-0000-0000-00000000b001'::uuid
    )
  ) or exists (
    select 1 from public.maestro_collaborators
    where id in (
      '00000000-0000-0000-0000-00000000a101',
      '00000000-0000-0000-0000-00000000b101'
    )
  ) then
    raise exception 'Tenant CI fixture IDs already exist; refusing to run.';
  end if;
end;
$preflight$;

insert into public.maestro_collaborators (id, login, password_hash, is_active, profile)
values
  ('00000000-0000-0000-0000-00000000a101', 'tenant-ci-a@invalid.test', 'fixture', true, '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000b101', 'tenant-ci-b@invalid.test', 'fixture', true, '{}'::jsonb);

insert into public.organizations (id, name, slug)
values
  ('00000000-0000-0000-0000-00000000a001', 'Tenant CI A', 'tenant-ci-a'),
  ('00000000-0000-0000-0000-00000000b001', 'Tenant CI B', 'tenant-ci-b');

insert into public.organization_members (organization_id, collaborator_id, role, status)
values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a101', 'owner', 'active'),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b101', 'owner', 'active');

insert into public.maestro_clients (id, organization_id, legacy_record_id, name)
values
  ('00000000-0000-0000-0000-00000000a201', '00000000-0000-0000-0000-00000000a001', 'tenant-ci-client-a', 'Tenant CI Client A'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000b001', 'tenant-ci-client-b', 'Tenant CI Client B');

insert into public.maestro_projects (id, organization_id, legacy_record_id, client_id, client_legacy_record_id, name)
values
  ('00000000-0000-0000-0000-00000000a301', '00000000-0000-0000-0000-00000000a001', 'tenant-ci-project-a', '00000000-0000-0000-0000-00000000a201', 'tenant-ci-client-a', 'Tenant CI Project A');

-- The product's authenticated frontend currently uses Edge Functions. Granting
-- SELECT only inside this transaction lets this test exercise the RLS policy
-- itself without persisting a broader client grant.
grant select on public.maestro_clients to authenticated;
set local role authenticated;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a101","role":"authenticated"}', true);
do $tenant_a$
declare
  membership_count integer;
  client_count integer;
begin
  select count(*) into membership_count from public.organization_members;
  select count(*) into client_count from public.maestro_clients;
  if membership_count <> 1 or client_count <> 1 then
    raise exception 'Tenant A isolation failed: memberships %, clients %.', membership_count, client_count;
  end if;
  if exists (select 1 from public.maestro_clients where organization_id <> '00000000-0000-0000-0000-00000000a001'::uuid) then
    raise exception 'Tenant A can see another tenant client.';
  end if;
end;
$tenant_a$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000b101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000b101","role":"authenticated"}', true);
do $tenant_b$
declare
  membership_count integer;
  client_count integer;
begin
  select count(*) into membership_count from public.organization_members;
  select count(*) into client_count from public.maestro_clients;
  if membership_count <> 1 or client_count <> 1 then
    raise exception 'Tenant B isolation failed: memberships %, clients %.', membership_count, client_count;
  end if;
  if exists (select 1 from public.maestro_clients where organization_id <> '00000000-0000-0000-0000-00000000b001'::uuid) then
    raise exception 'Tenant B can see another tenant client.';
  end if;
end;
$tenant_b$;

reset role;
do $cross_tenant_constraints$
begin
  begin
    insert into public.maestro_projects (
      organization_id, legacy_record_id, client_id, client_legacy_record_id, name
    ) values (
      '00000000-0000-0000-0000-00000000a001', 'tenant-ci-invalid-project',
      '00000000-0000-0000-0000-00000000b201', 'tenant-ci-client-b', 'Invalid cross-tenant project'
    );
    raise exception 'Cross-tenant project/client reference was accepted.';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.maestro_jobs (
      organization_id, legacy_record_id, project_id, project_legacy_record_id, title
    ) values (
      '00000000-0000-0000-0000-00000000b001', 'tenant-ci-invalid-job',
      '00000000-0000-0000-0000-00000000a301', 'tenant-ci-project-a', 'Invalid cross-tenant job'
    );
    raise exception 'Cross-tenant job/project reference was accepted.';
  exception when foreign_key_violation then
    null;
  end;
end;
$cross_tenant_constraints$;

rollback;
