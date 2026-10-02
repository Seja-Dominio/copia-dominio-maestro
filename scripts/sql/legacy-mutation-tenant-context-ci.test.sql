-- Proves the scoped legacy mutation RPC persists its explicit tenant even
-- when multiple organizations are active. All fixtures are rolled back.
begin;

do $preflight$
begin
  if exists (
    select 1 from public.organizations
    where id in (
      '00000000-0000-0000-0000-00000000d101'::uuid,
      '00000000-0000-0000-0000-00000000d102'::uuid
    ) or slug in ('tenant-context-ci-a', 'tenant-context-ci-b')
  ) or exists (
    select 1 from public.legacy_records
    where record_id in ('tenant-context-ci-job', 'tenant-context-ci-webhook')
  ) then
    raise exception 'Tenant-context fixture IDs already exist; refusing to run.';
  end if;
end;
$preflight$;

insert into public.organizations (id, name, slug, status)
values
  ('00000000-0000-0000-0000-00000000d101', 'Tenant Context CI A', 'tenant-context-ci-a', 'active'),
  ('00000000-0000-0000-0000-00000000d102', 'Tenant Context CI B', 'tenant-context-ci-b', 'active');

do $optional_provider_fixture$
begin
  if to_regclass('public.organization_integrations') is not null then
    insert into public.organization_integrations (organization_id, provider, external_key, status)
    values ('00000000-0000-0000-0000-00000000d102'::uuid, 'whatsapp', 'tenant-context-ci-webhook', 'active');
  end if;
end;
$optional_provider_fixture$;

set local role service_role;

do $scoped_legacy_mutation$
declare
  result jsonb;
  current_payload jsonb;
  caught_error text;
begin
  result := public.maestro_apply_legacy_mutation_scoped(
    '00000000-0000-0000-0000-00000000d101'::uuid,
    'create', 'Job', 'tenant-context-ci-job',
    '{"title":"Original title","status":"Aprov. Interna","briefing":"Initial"}'::jsonb,
    'tenant-context-ci-actor', 'Tenant Context CI'
  );
  if result ->> 'id' <> 'tenant-context-ci-job' then
    raise exception 'TEST_FAIL scoped Job create returned an unexpected record';
  end if;

  select payload into current_payload
  from public.legacy_records
  where organization_id = '00000000-0000-0000-0000-00000000d101'::uuid
    and entity = 'Job' and record_id = 'tenant-context-ci-job';
  if current_payload is null then
    raise exception 'TEST_FAIL scoped Job create did not persist the requested tenant';
  end if;

  perform public.maestro_apply_legacy_mutation_scoped(
    '00000000-0000-0000-0000-00000000d101'::uuid,
    'update', 'Job', 'tenant-context-ci-job',
    '{"briefing":"Updated"}'::jsonb,
    'tenant-context-ci-actor', 'Tenant Context CI'
  );

  select payload into current_payload
  from public.legacy_records
  where organization_id = '00000000-0000-0000-0000-00000000d101'::uuid
    and entity = 'Job' and record_id = 'tenant-context-ci-job';
  if current_payload ->> 'title' <> 'Original title'
    or current_payload ->> 'status' <> 'Aprov. Interna'
    or current_payload ->> 'briefing' <> 'Updated' then
    raise exception 'TEST_FAIL partial update failed to preserve unrelated fields';
  end if;

  begin
    perform public.maestro_apply_legacy_mutation_scoped(
      '00000000-0000-0000-0000-00000000d102'::uuid,
      'update', 'Job', 'tenant-context-ci-job',
      '{"title":"Cross-tenant overwrite"}'::jsonb,
      'tenant-context-ci-actor', 'Tenant Context CI'
    );
    raise exception 'TEST_FAIL cross-tenant mutation was accepted';
  exception when others then
    get stacked diagnostics caught_error = message_text;
    if caught_error <> 'record does not belong to organization'
      and caught_error <> 'TEST_FAIL cross-tenant mutation was accepted' then
      raise exception 'TEST_FAIL unexpected cross-tenant rejection: %', caught_error;
    end if;
    if caught_error = 'TEST_FAIL cross-tenant mutation was accepted' then raise; end if;
  end;

  if to_regclass('public.organization_integrations') is not null then
    perform set_config('maestro.organization_id', '', true);
    insert into public.legacy_records (entity, record_id, payload)
    values ('DominusWebhookReceipt', 'tenant-context-ci-webhook', '{"instance":"tenant-context-ci-webhook"}'::jsonb);
    if not exists (
      select 1 from public.legacy_records
      where entity = 'DominusWebhookReceipt'
        and record_id = 'tenant-context-ci-webhook'
        and organization_id = '00000000-0000-0000-0000-00000000d102'::uuid
    ) then
      raise exception 'TEST_FAIL optional provider integration owner was not preserved';
    end if;
  end if;

  raise notice 'PASS: explicit tenant persisted, partial update preserved fields, cross-tenant update rejected';
end;
$scoped_legacy_mutation$;

reset role;
rollback;
