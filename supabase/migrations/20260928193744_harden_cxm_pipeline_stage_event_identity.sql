-- Resolve legacy instance aliases and require the audit entry to describe the exact write.
create or replace function public.maestro_enqueue_cxm_pipeline_stage_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_stage text;
  v_new_stage text;
  v_client_id text;
  v_conversation_id text;
  v_channel text;
  v_instance_id text;
  v_stage_change_id text;
  v_source text;
begin
  if new.entity <> 'ClientSalesLead' or new.payload is null or tg_op = 'INSERT' then
    return new;
  end if;
  v_old_stage := coalesce(old.payload ->> 'stage', 'new');
  v_new_stage := coalesce(new.payload ->> 'stage', 'new');
  if v_old_stage = v_new_stage then return new; end if;

  v_source := coalesce(new.payload #>> '{stage_history,-1,source}', 'manual');
  if v_source not in ('manual', 'agent', 'undo') then return new; end if;
  if new.payload #>> '{stage_history,-1,from_stage}' is distinct from v_old_stage
    or new.payload #>> '{stage_history,-1,to_stage}' is distinct from v_new_stage then
    return new;
  end if;

  v_stage_change_id := nullif(btrim(new.payload #>> '{stage_history,-1,action_id}'), '');
  v_client_id := nullif(btrim(new.payload ->> 'client_id'), '');
  v_conversation_id := nullif(btrim(new.payload ->> 'conversation_id'), '');
  v_channel := lower(coalesce(new.payload ->> 'channel', ''));
  v_instance_id := coalesce(new.payload ->> 'instance_id', new.payload ->> 'instance', '');

  if v_stage_change_id is null or v_client_id is null or v_conversation_id is null
     or v_channel not in ('whatsapp', 'instagram', 'messenger') then
    return new;
  end if;
  if not exists (
    select 1 from public.legacy_records as client
    where client.entity = 'Client'
      and client.record_id = v_client_id
      and client.organization_id = new.organization_id
  ) then
    raise exception 'CXM pipeline stage event client is outside the lead organization'
      using errcode = '23514';
  end if;

  insert into public.cxm_pipeline_stage_events (
    organization_id, client_id, lead_id, conversation_id, channel, instance_id,
    stage_change_id, from_stage, to_stage, source
  ) values (
    new.organization_id, v_client_id, new.record_id, v_conversation_id,
    v_channel, v_instance_id, v_stage_change_id, v_old_stage, v_new_stage, v_source
  ) on conflict (organization_id, stage_change_id) do nothing;
  return new;
end;
$$;

revoke all on function public.maestro_enqueue_cxm_pipeline_stage_event() from public, anon, authenticated;
grant execute on function public.maestro_enqueue_cxm_pipeline_stage_event() to service_role;
