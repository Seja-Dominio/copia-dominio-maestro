-- Run only against the disposable Supabase database created by the CI replay.
begin;

do $preflight$
begin
  if exists (select 1 from cron.job where jobname = 'whatsapp_automation_runner') then
    raise exception 'Expected clean CI database without a WhatsApp cron job';
  end if;
  if exists (
    select 1 from vault.decrypted_secrets
    where name in ('whatsapp_automation_project_url', 'whatsapp_automation_cron_secret')
  ) then
    raise exception 'Expected clean CI database without WhatsApp scheduler secrets';
  end if;
end;
$preflight$;

select cron.schedule('whatsapp_automation_runner', '*/5 * * * *', 'select 4815162342');

-- WHATSAPP_SCHEDULER_CONFIG_MISSING_BARRIER

do $assert_preserved$
declare
  v_job cron.job%rowtype;
begin
  select * into strict v_job
  from cron.job
  where jobname = 'whatsapp_automation_runner';

  if not v_job.active or v_job.schedule <> '*/5 * * * *' or v_job.command <> 'select 4815162342' then
    raise exception 'WhatsApp cron was changed despite missing Vault configuration';
  end if;
end;
$assert_preserved$;

select vault.create_secret(
  'https://maestro-cron-fixture.invalid',
  'whatsapp_automation_project_url',
  'Synthetic endpoint for the disposable CI fixture'
) is not null as fixture_url_secret_created;
select vault.create_secret(
  repeat('x', 64),
  'whatsapp_automation_cron_secret',
  'Synthetic authorization value for the disposable CI fixture'
) is not null as fixture_worker_secret_created;

-- WHATSAPP_SCHEDULER_CONFIGURED_BARRIER

do $assert_configured$
declare
  v_job cron.job%rowtype;
  v_endpoint_ok boolean;
  v_handler_ok boolean;
  v_action_ok boolean;
  v_secret_key_ok boolean;
  v_secret_embedded boolean;
begin
  select * into strict v_job
  from cron.job
  where jobname = 'whatsapp_automation_runner';

  v_endpoint_ok := position('https://maestro-cron-fixture.invalid' in v_job.command) > 0;
  v_handler_ok := position('/functions/v1/whatsapp-send' in v_job.command) > 0;
  v_action_ok := position('processScheduled' in v_job.command) > 0;
  v_secret_key_ok := position('whatsapp_automation_cron_secret' in v_job.command) > 0;
  v_secret_embedded := position(repeat('x', 64) in v_job.command) > 0;

  if not v_job.active or v_job.schedule <> '*/5 * * * *'
    or not v_endpoint_ok or not v_handler_ok or not v_action_ok or not v_secret_key_ok or v_secret_embedded then
    raise exception 'WhatsApp scheduler assertion failed: active=%, schedule_ok=%, endpoint_ok=%, handler_ok=%, action_ok=%, secret_key_ok=%, secret_embedded=%',
      v_job.active, v_job.schedule = '*/5 * * * *', v_endpoint_ok, v_handler_ok, v_action_ok, v_secret_key_ok, v_secret_embedded;
  end if;
end;
$assert_configured$;

rollback;
