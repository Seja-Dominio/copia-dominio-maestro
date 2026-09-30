create extension if not exists pgmq;

select pgmq.create('cxm_webhook_events');

create table public.cxm_webhook_event_receipts (
  event_key text primary key,
  instance text not null,
  queue_message_id bigint not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retrying', 'processed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index cxm_webhook_event_receipts_status_created_idx
  on public.cxm_webhook_event_receipts (status, created_at desc);

alter table public.cxm_webhook_event_receipts enable row level security;
revoke all on table public.cxm_webhook_event_receipts from public, anon, authenticated, service_role;

create or replace function public.cxm_webhook_queue_enqueue(p_event_key text, p_instance text, p_payload jsonb, p_test_mode boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue_message_id bigint;
begin
  if nullif(btrim(p_event_key), '') is null or nullif(btrim(p_instance), '') is null or p_payload is null then
    raise exception 'Invalid CXM webhook queue message';
  end if;
  if coalesce(p_test_mode, false) and p_instance not like 'cxm-test-%' then
    raise exception 'Synthetic CXM queue tests require a cxm-test instance';
  end if;

  insert into public.cxm_webhook_event_receipts (event_key, instance, queue_message_id)
  values (p_event_key, p_instance, 0)
  on conflict (event_key) do nothing;
  if not found then
    return false;
  end if;

  v_queue_message_id := pgmq.send(
    queue_name => 'cxm_webhook_events',
    msg => jsonb_build_object('event_key', p_event_key, 'instance', p_instance, 'payload', p_payload, 'test_only', coalesce(p_test_mode, false))
  );

  update public.cxm_webhook_event_receipts
  set queue_message_id = v_queue_message_id, updated_at = now()
  where event_key = p_event_key;
  return true;
end;
$$;

create or replace function public.cxm_webhook_queue_read(p_qty integer default 5, p_visibility_seconds integer default 120)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  with claimed as (
    select q.msg_id, q.read_ct, q.enqueued_at, q.message
    from pgmq.read(
      queue_name => 'cxm_webhook_events',
      vt => least(greatest(p_visibility_seconds, 30), 600),
      qty => least(greatest(p_qty, 1), 10)
    ) as q
  ), updated as (
    update public.cxm_webhook_event_receipts as receipt
    set status = 'processing', attempts = claimed.read_ct, updated_at = now(), last_error = null
    from claimed
    where receipt.event_key = claimed.message ->> 'event_key'
    returning receipt.event_key
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'msg_id', claimed.msg_id,
      'read_ct', claimed.read_ct,
      'enqueued_at', claimed.enqueued_at,
      'message', claimed.message
    ) order by claimed.msg_id),
    '[]'::jsonb
  )
  into v_messages
  from claimed;

  return v_messages;
end;
$$;

create or replace function public.cxm_webhook_queue_complete(p_event_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue_message_id bigint;
begin
  select queue_message_id into v_queue_message_id
  from public.cxm_webhook_event_receipts
  where event_key = p_event_key
  for update;
  if not found then
    return false;
  end if;

  perform pgmq.delete('cxm_webhook_events', v_queue_message_id);
  update public.cxm_webhook_event_receipts
  set status = 'processed', last_error = null, processed_at = coalesce(processed_at, now()), updated_at = now()
  where event_key = p_event_key;
  return true;
end;
$$;

create or replace function public.cxm_webhook_queue_fail(p_event_key text, p_attempts integer, p_error text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.cxm_webhook_event_receipts
  set status = 'retrying', attempts = greatest(coalesce(p_attempts, attempts), attempts),
      last_error = left(coalesce(nullif(p_error, ''), 'Falha não detalhada'), 500), updated_at = now()
  where event_key = p_event_key
  returning true;
$$;

create or replace function public.cxm_webhook_worker_authorized(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_secret) >= 48
    and exists (
      select 1 from vault.decrypted_secrets
      where name = 'cxm_webhook_worker_secret' and decrypted_secret = p_secret
    ),
    false
  );
$$;

revoke all on function public.cxm_webhook_queue_enqueue(text, text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.cxm_webhook_queue_read(integer, integer) from public, anon, authenticated;
revoke all on function public.cxm_webhook_queue_complete(text) from public, anon, authenticated;
revoke all on function public.cxm_webhook_queue_fail(text, integer, text) from public, anon, authenticated;
revoke all on function public.cxm_webhook_worker_authorized(text) from public, anon, authenticated;
grant execute on function public.cxm_webhook_queue_enqueue(text, text, jsonb, boolean) to service_role;
grant execute on function public.cxm_webhook_queue_read(integer, integer) to service_role;
grant execute on function public.cxm_webhook_queue_complete(text) to service_role;
grant execute on function public.cxm_webhook_queue_fail(text, integer, text) to service_role;
grant execute on function public.cxm_webhook_worker_authorized(text) to service_role;

select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'cxm_webhook_worker_secret',
  'Private authorization for the CXM webhook retry worker in this environment'
)
where not exists (select 1 from vault.decrypted_secrets where name = 'cxm_webhook_worker_secret');

do $outer$
declare
  v_project_url text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'cxm_webhook_project_url'
  limit 1;

  if nullif(btrim(v_project_url), '') is null or not exists (
    select 1 from vault.decrypted_secrets
    where name = 'cxm_webhook_worker_secret' and length(decrypted_secret) >= 48
  ) then
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
