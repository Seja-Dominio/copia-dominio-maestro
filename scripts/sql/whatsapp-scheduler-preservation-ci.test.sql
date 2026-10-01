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

-- Apply the forward migration with an existing job and missing Vault config.
\ir ../../supabase/migrations/20261001160000_preserve_whatsapp_scheduler_without_vault_config.sql

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

rollback;
