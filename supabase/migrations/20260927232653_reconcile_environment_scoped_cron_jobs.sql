-- Schedulers are environment configuration, not a prerequisite for schema replay.
-- Each environment must provision its own API URL and secret in Vault.
do $schedulers$
declare
  v_project_url text;
  v_cron_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'whatsapp_automation_project_url' limit 1;
  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets where name = 'whatsapp_automation_cron_secret' limit 1;

  if nullif(btrim(v_project_url), '') is null or length(coalesce(v_cron_secret, '')) < 48 then
    if exists (select 1 from cron.job where jobname = 'whatsapp_automation_runner') then
      perform cron.unschedule('whatsapp_automation_runner');
    end if;
    raise notice 'WhatsApp scheduler left disabled: this environment URL and a valid Vault secret are required';
  else
    if exists (select 1 from cron.job where jobname = 'whatsapp_automation_runner') then
      perform cron.unschedule('whatsapp_automation_runner');
    end if;
    perform cron.schedule(
      'whatsapp_automation_runner',
      '*/5 * * * *',
      format($job$
        select net.http_post(
          url := %L || '/functions/v1/whatsapp-send',
          body := '{"action":"processScheduled"}'::jsonb,
          params := '{}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-maestro-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_automation_cron_secret')
          ),
          timeout_milliseconds := 10000
        );
      $job$, rtrim(v_project_url, '/'))
    );
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'cxm_webhook_project_url' limit 1;
  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets where name = 'cxm_webhook_worker_secret' limit 1;

  if nullif(btrim(v_project_url), '') is null or length(coalesce(v_cron_secret, '')) < 48 then
    if exists (select 1 from cron.job where jobname = 'cxm_webhook_queue_runner') then
      perform cron.unschedule('cxm_webhook_queue_runner');
    end if;
    raise notice 'CXM webhook scheduler left disabled: this environment URL and a valid Vault secret are required';
  else
    if exists (select 1 from cron.job where jobname = 'cxm_webhook_queue_runner') then
      perform cron.unschedule('cxm_webhook_queue_runner');
    end if;
    perform cron.schedule(
      'cxm_webhook_queue_runner',
      '* * * * *',
      format($job$
        select net.http_post(
          url := %L || '/functions/v1/dominus-webhook',
          body := '{"action":"process_cxm_webhook_queue"}'::jsonb,
          params := '{}'::jsonb,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cxm-queue-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'cxm_webhook_worker_secret')
          ),
          timeout_milliseconds := 45000
        );
      $job$, rtrim(v_project_url, '/'))
    );
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'meta_ads_sync_project_url' limit 1;
  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets where name = 'meta_ads_sync_cron_secret' limit 1;

  if nullif(btrim(v_project_url), '') is null or length(coalesce(v_cron_secret, '')) < 48 then
    if exists (select 1 from cron.job where jobname = 'ads_brain_meta_sync') then
      perform cron.unschedule('ads_brain_meta_sync');
    end if;
    raise notice 'Ads Brain scheduler left disabled: this environment URL and a valid Vault secret are required';
  else
    if exists (select 1 from cron.job where jobname = 'ads_brain_meta_sync') then
      perform cron.unschedule('ads_brain_meta_sync');
    end if;
    perform cron.schedule(
      'ads_brain_meta_sync',
      '0 */6 * * *',
      format($job$
        select net.http_post(
          url := %L || '/functions/v1/meta-ads-sync-cron',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-maestro-cron-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'meta_ads_sync_cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 120000
        );
      $job$, rtrim(v_project_url, '/'))
    );
  end if;
end;
$schedulers$;
