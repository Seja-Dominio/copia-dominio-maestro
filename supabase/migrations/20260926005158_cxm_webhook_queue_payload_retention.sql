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

  -- Message bodies can contain customer communications. Delete successful queue
  -- payloads; the inbox is the system of record, not a second archive.
  perform pgmq.delete('cxm_webhook_events', v_queue_message_id);
  update public.cxm_webhook_event_receipts
  set status = 'processed', last_error = null, processed_at = coalesce(processed_at, now()), updated_at = now()
  where event_key = p_event_key;
  return true;
end;
$$;

revoke all on function public.cxm_webhook_queue_complete(text) from public, anon, authenticated;
grant execute on function public.cxm_webhook_queue_complete(text) to service_role;
