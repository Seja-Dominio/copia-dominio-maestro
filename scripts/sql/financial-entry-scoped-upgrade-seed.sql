-- Committed synthetic baseline for the upgrade test starting at migration
-- 20260929165050. Run only against an isolated disposable database.
begin;

do $preconditions$
begin
  if exists (select 1 from public.organizations where id in (
      '00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000f502'))
    or exists (select 1 from public.maestro_financial_entries where legacy_record_id like 'financial-upgrade-%-ci')
    or exists (select 1 from public.maestro_clients where legacy_record_id='financial-upgrade-client-b-ci')
    or exists (select 1 from public.relational_integrity_exceptions where legacy_record_id like 'financial-upgrade-%-ci') then
    raise exception 'Upgrade fixture identifiers already exist; refusing to overwrite test data';
  end if;
end;
$preconditions$;

insert into public.organizations (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000000f501', 'Financial Upgrade Tenant A CI', 'financial-upgrade-tenant-a-ci', 'active'),
  ('00000000-0000-0000-0000-00000000f502', 'Financial Upgrade Tenant B CI', 'financial-upgrade-tenant-b-ci', 'active');

insert into public.maestro_clients (organization_id, legacy_record_id, name) values
  ('00000000-0000-0000-0000-00000000f502', 'financial-upgrade-client-b-ci', 'Tenant B client');

insert into public.maestro_financial_entries (
  organization_id, legacy_record_id, title, source_payload
) values
  ('00000000-0000-0000-0000-00000000f501', 'financial-upgrade-audited-entry-ci', 'Before upgrade: unresolved client', '{"client_id":"financial-upgrade-missing-client-ci"}'),
  ('00000000-0000-0000-0000-00000000f501', 'financial-upgrade-cross-client-entry-ci', 'Before upgrade: cross-tenant client', '{"client_id":"financial-upgrade-client-b-ci"}');

insert into public.relational_integrity_exceptions (
  organization_id, entity, legacy_record_id, issue_type, payload
) values
  ('00000000-0000-0000-0000-00000000f501', 'FinancialEntry', 'financial-upgrade-audited-entry-ci', 'missing_financial_client_link', '{"client_legacy_record_id":"financial-upgrade-missing-client-ci"}'),
  ('00000000-0000-0000-0000-00000000f501', 'FinancialEntry', 'financial-upgrade-cross-client-entry-ci', 'missing_financial_client_link', '{"client_legacy_record_id":"financial-upgrade-client-b-ci"}');

commit;
