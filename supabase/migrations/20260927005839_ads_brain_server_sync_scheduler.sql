create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.meta_ads_sync_cron_authorized(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_secret) >= 48
    and exists (
      select 1
      from vault.decrypted_secrets
      where name = 'meta_ads_sync_cron_secret'
        and decrypted_secret = p_secret
    ),
    false
  );
$$;

revoke all on function public.meta_ads_sync_cron_authorized(text) from public, anon, authenticated;
grant execute on function public.meta_ads_sync_cron_authorized(text) to service_role;

select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'meta_ads_sync_cron_secret',
  'Private authorization for the scheduled Ads Brain Meta sync'
)
where not exists (
  select 1 from vault.decrypted_secrets where name = 'meta_ads_sync_cron_secret'
);

do $schedule$
declare
  project_url text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'meta_ads_sync_project_url'
  limit 1;

  if nullif(btrim(project_url), '') is null or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'meta_ads_sync_cron_secret' and length(decrypted_secret) >= 48
  ) then
    if exists (select 1 from cron.job where jobname = 'ads_brain_meta_sync') then
      perform cron.unschedule('ads_brain_meta_sync');
    end if;
    raise notice 'Skipping Ads Brain scheduler: configure this environment URL and cron secret in Vault';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'ads_brain_meta_sync') then
    perform cron.unschedule('ads_brain_meta_sync');
  end if;

  perform cron.schedule(
    'ads_brain_meta_sync',
    '0 */6 * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'meta_ads_sync_project_url') || '/functions/v1/meta-ads-sync-cron',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-maestro-cron-secret',
          (select decrypted_secret from vault.decrypted_secrets where name = 'meta_ads_sync_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $job$
  );
end;
$schedule$;
