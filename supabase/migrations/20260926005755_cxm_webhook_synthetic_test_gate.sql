create or replace function public.cxm_webhook_queue_enqueue(
  p_event_key text,
  p_instance text,
  p_payload jsonb,
  p_test_mode boolean
)
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
    msg => jsonb_build_object(
      'event_key', p_event_key,
      'instance', p_instance,
      'payload', p_payload,
      'test_only', coalesce(p_test_mode, false)
    )
  );
  update public.cxm_webhook_event_receipts
  set queue_message_id = v_queue_message_id, updated_at = now()
  where event_key = p_event_key;
  return true;
end;
$$;

revoke all on function public.cxm_webhook_queue_enqueue(text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.cxm_webhook_queue_enqueue(text, text, jsonb, boolean) to service_role;
