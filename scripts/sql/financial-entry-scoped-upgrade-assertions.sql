-- Verify the post-upgrade RPC contract against committed synthetic baseline
-- rows. Run only against the isolated database used by the paired seed file.
begin;

do $baseline_assertions$
begin
  if (select count(*) from public.organizations where id in (
      '00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000f502')) <> 2
    or (select count(*) from public.maestro_financial_entries where legacy_record_id in (
      'financial-upgrade-audited-entry-ci', 'financial-upgrade-cross-client-entry-ci')) <> 2
    or not exists (select 1 from public.maestro_clients where organization_id='00000000-0000-0000-0000-00000000f502' and legacy_record_id='financial-upgrade-client-b-ci') then
    raise exception 'Representative two-tenant baseline data did not survive the migration upgrade';
  end if;

  if not exists (
    select 1 from public.legacy_cutover_registry
    where entity='FinancialEntry' and legacy_write_allowed=false
  ) then raise exception 'Upgrade unexpectedly enabled legacy FinancialEntry writes'; end if;
end;
$baseline_assertions$;

set local role service_role;

do $rpc_upgrade_contract$
declare
  v_error text;
begin
  perform public.maestro_upsert_financial_entries_scoped(
    '00000000-0000-0000-0000-00000000f501',
    '[{"id":"financial-upgrade-audited-entry-ci","title":"Updated after upgrade","amount":"31.25","client_id":"financial-upgrade-missing-client-ci"}]'::jsonb
  );

  begin
    perform public.maestro_upsert_financial_entries_scoped(
      '00000000-0000-0000-0000-00000000f501',
      '[{"id":"financial-upgrade-cross-client-entry-ci","title":"Must not be written","client_id":"financial-upgrade-client-b-ci"}]'::jsonb
    );
    raise exception 'TEST_FAIL upgraded RPC accepted a client owned by another tenant';
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'Financial entry client must belong to the same organization' then
      raise exception 'Unexpected cross-tenant client rejection after upgrade: %', v_error;
    end if;
  end;
end;
$rpc_upgrade_contract$;

reset role;

do $post_upgrade_assertions$
begin
  if not exists (
    select 1 from public.maestro_financial_entries
    where organization_id='00000000-0000-0000-0000-00000000f501'
      and legacy_record_id='financial-upgrade-audited-entry-ci'
      and title='Updated after upgrade' and amount=31.25
      and client_legacy_record_id is null
      and source_payload->>'client_id'='financial-upgrade-missing-client-ci'
  ) then raise exception 'Upgrade failed to preserve the audited unresolved client snapshot during an unrelated update'; end if;

  if not exists (
    select 1 from public.relational_integrity_exceptions
    where organization_id='00000000-0000-0000-0000-00000000f501'
      and legacy_record_id='financial-upgrade-audited-entry-ci'
      and issue_type='missing_financial_client_link'
      and resolution_status='pending'
      and payload->>'client_legacy_record_id'='financial-upgrade-missing-client-ci'
  ) then raise exception 'Upgrade changed or removed the pending integrity exception'; end if;

  if not exists (
    select 1 from public.maestro_financial_entries
    where organization_id='00000000-0000-0000-0000-00000000f501'
      and legacy_record_id='financial-upgrade-cross-client-entry-ci'
      and title='Before upgrade: cross-tenant client'
      and client_legacy_record_id is null
      and source_payload->>'client_id'='financial-upgrade-client-b-ci'
  ) then raise exception 'Rejected cross-tenant update changed the source row'; end if;
end;
$post_upgrade_assertions$;

rollback;

begin;
delete from public.relational_integrity_exceptions
where organization_id='00000000-0000-0000-0000-00000000f501'
  and legacy_record_id in ('financial-upgrade-audited-entry-ci', 'financial-upgrade-cross-client-entry-ci');
delete from public.maestro_financial_entries
where organization_id='00000000-0000-0000-0000-00000000f501'
  and legacy_record_id in ('financial-upgrade-audited-entry-ci', 'financial-upgrade-cross-client-entry-ci');
delete from public.maestro_clients
where organization_id='00000000-0000-0000-0000-00000000f502'
  and legacy_record_id='financial-upgrade-client-b-ci';
delete from public.organizations
where id in ('00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000f502');
commit;

do $cleanup_assertions$
begin
  if exists (select 1 from public.organizations where id in (
      '00000000-0000-0000-0000-00000000f501', '00000000-0000-0000-0000-00000000f502'))
    or exists (select 1 from public.maestro_financial_entries where legacy_record_id like 'financial-upgrade-%-ci')
    or exists (select 1 from public.maestro_clients where legacy_record_id='financial-upgrade-client-b-ci')
    or exists (select 1 from public.relational_integrity_exceptions where legacy_record_id like 'financial-upgrade-%-ci') then
    raise exception 'Financial upgrade fixture cleanup left synthetic rows behind';
  end if;
end;
$cleanup_assertions$;

select 'financial entry scoped upgrade contract passed and fixture cleaned' as result;
