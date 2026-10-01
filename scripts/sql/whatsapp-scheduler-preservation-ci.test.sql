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
begin
  select * into strict v_job
  from cron.job
  where jobname = 'whatsapp_automation_runner';

  if not v_job.active
    or v_job.schedule <> '*/5 * * * *'
    or position('https://maestro-cron-fixture.invalid/functions/v1/whatsapp-send' in v_job.command) = 0
    or position('processScheduled' in v_job.command) = 0
    or position('whatsapp_automation_cron_secret' in v_job.command) = 0
    or position(repeat('x', 64) in v_job.command) > 0 then
    raise exception 'WhatsApp cron was not safely configured from synthetic Vault settings';
  end if;
end;
$assert_configured$;

rollback;
