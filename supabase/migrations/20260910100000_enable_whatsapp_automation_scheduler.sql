create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.get_whatsapp_automation_cron_secret()
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'whatsapp_automation_cron_secret'
  limit 1
$$;

revoke all on function public.get_whatsapp_automation_cron_secret() from public, anon, authenticated;
grant execute on function public.get_whatsapp_automation_cron_secret() to service_role;

do $outer$
begin
  if exists (select 1 from cron.job where jobname = 'whatsapp_automation_runner') then
    perform cron.unschedule('whatsapp_automation_runner');
  end if;
  perform cron.schedule(
    'whatsapp_automation_runner',
    '*/5 * * * *',
    $job$
      select net.http_post(
        url := 'https://fwpisypiiezjhtqxlmqv.supabase.co/functions/v1/whatsapp-send',
        body := '{"action":"processScheduled"}'::jsonb,
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-maestro-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_automation_cron_secret')
        ),
        timeout_milliseconds := 10000
      );
    $job$
  );
end
$outer$;
