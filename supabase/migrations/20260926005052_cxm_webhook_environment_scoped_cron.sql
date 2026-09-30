-- Before applying in each environment, provision the non-secret project API URL
-- in Vault as cxm_webhook_project_url. This prevents cross-environment callbacks.
do $outer$
declare
  v_project_url text;
  v_worker_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'cxm_webhook_project_url'
  limit 1;
  select decrypted_secret into v_worker_secret
  from vault.decrypted_secrets
  where name = 'cxm_webhook_worker_secret'
  limit 1;

  if nullif(btrim(v_project_url), '') is null or length(coalesce(v_worker_secret, '')) < 48 then
    if exists (select 1 from cron.job where jobname = 'cxm_webhook_queue_runner') then
      perform cron.unschedule('cxm_webhook_queue_runner');
    end if;
    raise notice 'Skipping CXM webhook scheduler: configure this environment URL and worker secret in Vault';
    return;
  end if;

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
end
$outer$;
