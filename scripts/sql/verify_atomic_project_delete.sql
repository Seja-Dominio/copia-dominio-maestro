-- Rollback-only contract for scoped project deletion and audit persistence.
-- Run only against Dev or an isolated verification database.
begin;

do $preflight$
begin
  if to_regclass('public.legacy_records') is null
    or to_regclass('public.maestro_projects') is null
    or to_regprocedure('public.maestro_apply_legacy_mutation_scoped(uuid,text,text,text,jsonb,text,text)') is null then
    raise exception 'TEST_PREREQUISITE scoped project delete contract is not installed';
  end if;
end;
$preflight$;

do $setup$
declare
  v_org uuid := gen_random_uuid();
  v_client text := 'atomic-project-delete-client-' || gen_random_uuid()::text;
  v_project text := 'atomic-project-delete-project-' || gen_random_uuid()::text;
begin
  insert into public.organizations(id, name, slug, status, created_at)
  values (v_org, 'Atomic project delete test tenant', 'atomic-project-delete-' || left(v_org::text, 8), 'active', now());

  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'Client', v_client, jsonb_build_object('id', v_client, 'name', 'Atomic project delete test client'));
  insert into public.legacy_records(organization_id, entity, record_id, payload)
  values (v_org, 'Project', v_project, jsonb_build_object('id', v_project, 'name', 'Atomic project delete test project', 'client_id', v_client));

  if not exists (
    select 1 from public.maestro_projects
    where organization_id = v_org and legacy_record_id = v_project
  ) then raise exception 'TEST_FAIL project fixture was not projected'; end if;

  perform set_config('maestro_test.project_delete_org', v_org::text, true);
  perform set_config('maestro_test.project_delete_id', v_project, true);
end;
$setup$;

set local role service_role;

do $invoke$
declare
  v_org uuid := current_setting('maestro_test.project_delete_org')::uuid;
  v_project text := current_setting('maestro_test.project_delete_id');
  v_result jsonb;
begin
  select public.maestro_apply_legacy_mutation_scoped(
    v_org, 'delete', 'Project', v_project, '{}'::jsonb, 'test-actor', 'Test Actor'
  ) into v_result;

  if coalesce(v_result->>'deleted', 'false') <> 'true' then
    raise exception 'TEST_FAIL scoped project delete RPC did not report deletion';
  end if;
end;
$invoke$;

reset role;

do $assert$
declare
  v_org uuid := current_setting('maestro_test.project_delete_org')::uuid;
  v_project text := current_setting('maestro_test.project_delete_id');
begin
  if exists (select 1 from public.legacy_records where organization_id=v_org and entity='Project' and record_id=v_project)
    or exists (select 1 from public.maestro_projects where organization_id=v_org and legacy_record_id=v_project)
    or not exists (select 1 from public.legacy_records where organization_id=v_org and entity='DeleteLog' and payload->>'entity_id'=v_project and payload->>'entity_type'='project')
    or not exists (select 1 from public.legacy_records where organization_id=v_org and entity='SystemAuditLog' and payload->>'entity'='Project' and payload->>'record_id'=v_project and payload->>'action'='delete')
  then raise exception 'TEST_FAIL project delete, relational projection, or audit was not atomic'; end if;
end;
$assert$;
rollback;
