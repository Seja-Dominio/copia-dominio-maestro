-- Serialize customer WhatsApp-number reservations so parallel requests cannot
-- exceed the product limit of five numbers per client.
create or replace function public.reserve_client_whatsapp_number(
  p_client_id text,
  p_record_id text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved_count integer;
begin
  if p_client_id is null or p_client_id = '' or p_record_id is null or p_record_id = '' then
    raise exception 'client_id and record_id are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_id, 0));

  select count(*) into reserved_count
  from public.legacy_records
  where entity = 'ClientWhatsappNumber'
    and payload->>'client_id' = p_client_id;

  if reserved_count >= 5 then
    return false;
  end if;

  insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
  values ('ClientWhatsappNumber', p_record_id, p_payload, now(), now());

  return true;
end;
$$;

revoke all on function public.reserve_client_whatsapp_number(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_client_whatsapp_number(text, text, jsonb) to service_role;
