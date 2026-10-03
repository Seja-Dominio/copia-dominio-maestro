-- Rollback-only integration contract for the service_role financial write RPC.
begin;

insert into public.organizations (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000000f401', 'Financial RPC Tenant A CI', 'financial-rpc-tenant-a-ci', 'active'),
  ('00000000-0000-0000-0000-00000000f402', 'Financial RPC Tenant B CI', 'financial-rpc-tenant-b-ci', 'active');

insert into public.maestro_bank_accounts (legacy_record_id, organization_id, name) values
  ('financial-rpc-bank-a-ci', '00000000-0000-0000-0000-00000000f401', 'Tenant A account'),
  ('financial-rpc-bank-b-ci', '00000000-0000-0000-0000-00000000f402', 'Tenant B account');

insert into public.maestro_clients (organization_id, legacy_record_id, name) values
  ('00000000-0000-0000-0000-00000000f402', 'financial-rpc-client-b-ci', 'Tenant B client');

insert into public.maestro_financial_entries (
  organization_id, legacy_record_id, title, source_payload
) values
  ('00000000-0000-0000-0000-00000000f401', 'financial-rpc-audited-entry-ci', 'Before audited update', '{"client_id":"financial-rpc-missing-client-ci"}'),
  ('00000000-0000-0000-0000-00000000f401', 'financial-rpc-cross-client-entry-ci', 'Before cross-tenant rejection', '{"client_id":"financial-rpc-client-b-ci"}');

insert into public.relational_integrity_exceptions (
  organization_id, entity, legacy_record_id, issue_type, payload
) values
  ('00000000-0000-0000-0000-00000000f401', 'FinancialEntry', 'financial-rpc-audited-entry-ci', 'missing_financial_client_link', '{"client_legacy_record_id":"financial-rpc-missing-client-ci"}'),
  ('00000000-0000-0000-0000-00000000f401', 'FinancialEntry', 'financial-rpc-cross-client-entry-ci', 'missing_financial_client_link', '{"client_legacy_record_id":"financial-rpc-client-b-ci"}');

set local role service_role;

do $rpc_contract$
declare
  v_error text;
begin
  perform public.maestro_upsert_financial_entries_scoped(
    '00000000-0000-0000-0000-00000000f401',
    '[{"id":"financial-rpc-valid-entry-ci","title":"Valid scoped write","amount":"12.50","bank_account_id":"financial-rpc-bank-a-ci"}]'::jsonb
  );

  begin
    perform public.maestro_upsert_financial_entries_scoped(
      '00000000-0000-0000-0000-00000000f401',
      '[{"id":"financial-rpc-cross-bank-entry-ci","title":"Must roll back","amount":"20.00","bank_account_id":"financial-rpc-bank-b-ci"}]'::jsonb
    );
    raise exception 'TEST_FAIL cross-tenant bank account was accepted';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Financial entry bank account must belong to the same organization' then
      raise exception 'Unexpected bank-account rejection: %', v_error;
    end if;
  end;

  perform public.maestro_upsert_financial_entries_scoped(
    '00000000-0000-0000-0000-00000000f401',
    '[{"id":"financial-rpc-audited-entry-ci","title":"Audited snapshot preserved","client_id":"financial-rpc-missing-client-ci"}]'::jsonb
  );

  begin
    perform public.maestro_upsert_financial_entries_scoped(
      '00000000-0000-0000-0000-00000000f401',
      '[{"id":"financial-rpc-cross-client-entry-ci","title":"Must remain unchanged","client_id":"financial-rpc-client-b-ci"}]'::jsonb
    );
    raise exception 'TEST_FAIL audited exception allowed a client owned by another tenant';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Financial entry client must belong to the same organization' then
      raise exception 'Unexpected cross-tenant client rejection: %', v_error;
    end if;
  end;
end;
$rpc_contract$;

reset role;

do $assertions$
begin
  if not exists (
    select 1 from public.maestro_financial_entries
    where organization_id='00000000-0000-0000-0000-00000000f401'
      and legacy_record_id='financial-rpc-valid-entry-ci'
      and amount=12.50 and bank_account_legacy_record_id='financial-rpc-bank-a-ci'
  ) then raise exception 'Valid same-tenant RPC write did not round-trip to the relational row'; end if;

  if exists (select 1 from public.maestro_financial_entries where legacy_record_id='financial-rpc-cross-bank-entry-ci') then
    raise exception 'Rejected cross-tenant bank-account call left a partial relational write';
  end if;

  if not exists (
    select 1 from public.maestro_financial_entries
    where organization_id='00000000-0000-0000-0000-00000000f401'
      and legacy_record_id='financial-rpc-audited-entry-ci'
      and title='Audited snapshot preserved'
      and client_legacy_record_id is null
      and source_payload->>'client_id'='financial-rpc-missing-client-ci'
  ) then raise exception 'Matching audited exception did not preserve the unresolved legacy client snapshot'; end if;

  if not exists (
    select 1 from public.maestro_financial_entries
    where organization_id='00000000-0000-0000-0000-00000000f401'
      and legacy_record_id='financial-rpc-cross-client-entry-ci'
      and title='Before cross-tenant rejection'
      and client_legacy_record_id is null
  ) then raise exception 'Audited exception allowed or partially applied a cross-tenant client reference'; end if;

  if exists (select 1 from public.legacy_records where entity='FinancialEntry' and record_id like 'financial-rpc-%-ci') then
    raise exception 'Relational-only FinancialEntry RPC unexpectedly wrote the legacy source';
  end if;
end;
$assertions$;

select 'financial entry scoped write contract passed under service_role' as result;
rollback;

do $rollback_assertions$
begin
  if exists (select 1 from public.organizations where id in (
      '00000000-0000-0000-0000-00000000f401', '00000000-0000-0000-0000-00000000f402'))
    or exists (select 1 from public.maestro_financial_entries where legacy_record_id like 'financial-rpc-%-ci')
    or exists (select 1 from public.maestro_bank_accounts where legacy_record_id like 'financial-rpc-bank-%-ci')
    or exists (select 1 from public.maestro_clients where legacy_record_id='financial-rpc-client-b-ci')
    or exists (select 1 from public.relational_integrity_exceptions where legacy_record_id like 'financial-rpc-%-ci') then
    raise exception 'Financial RPC rollback fixture left synthetic rows behind';
  end if;
end;
$rollback_assertions$;
