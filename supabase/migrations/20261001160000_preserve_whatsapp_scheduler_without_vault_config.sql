-- A missing environment URL/secret must not silently disable an already
-- provisioned worker during a schema upgrade. Keep the current job untouched
-- until both environment-specific values are available.
do $whatsapp_scheduler$
declare
  v_project_url text;
  v_cron_secret text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'whatsapp_automation_project_url'
  limit 1;

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'whatsapp_automation_cron_secret'
  limit 1;

  if nullif(btrim(v_project_url), '') is null or length(coalesce(v_cron_secret, '')) < 48 then
    raise notice 'WhatsApp scheduler unchanged: configure this environment URL and a valid Vault secret before updating it';
    return;
  end if;

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
end;
$whatsapp_scheduler$;
