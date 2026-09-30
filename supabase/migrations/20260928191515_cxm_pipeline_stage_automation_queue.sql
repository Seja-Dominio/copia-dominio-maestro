-- Durable, tenant-scoped queue for customer pipeline stage-change automations.
-- Automation-originated stage writes are excluded to prevent recursive bot loops.
create table public.cxm_pipeline_stage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id text not null,
  lead_id text not null,
  conversation_id text not null,
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  instance_id text not null default '',
  stage_change_id text not null,
  from_stage text not null,
  to_stage text not null,
  source text not null check (source in ('manual', 'agent', 'undo')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'retrying', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organization_id, stage_change_id)
);

create index cxm_pipeline_stage_events_claim_idx
  on public.cxm_pipeline_stage_events (status, locked_until, created_at)
  where status in ('queued', 'retrying', 'processing');
create index cxm_pipeline_stage_events_client_idx
  on public.cxm_pipeline_stage_events (organization_id, client_id, created_at desc);

alter table public.cxm_pipeline_stage_events enable row level security;
revoke all on table public.cxm_pipeline_stage_events from public, anon, authenticated;
grant select, insert, update, delete on table public.cxm_pipeline_stage_events to service_role;

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
  v_stage_change_id := nullif(btrim(new.payload #>> '{stage_history,-1,action_id}'), '');
  v_client_id := nullif(btrim(new.payload ->> 'client_id'), '');
  v_conversation_id := nullif(btrim(new.payload ->> 'conversation_id'), '');
  v_channel := lower(coalesce(new.payload ->> 'channel', ''));
  v_instance_id := coalesce(new.payload ->> 'instance_id', '');

  -- Do not route a funnel change without an exact customer/conversation key.
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
drop trigger if exists maestro_cxm_pipeline_stage_event on public.legacy_records;
create trigger maestro_cxm_pipeline_stage_event
  after update of payload on public.legacy_records
  for each row
  when (old.entity = 'ClientSalesLead' and new.entity = 'ClientSalesLead')
  execute function public.maestro_enqueue_cxm_pipeline_stage_event();

create or replace function public.cxm_pipeline_stage_event_claim(
  p_qty integer default 25,
  p_visibility_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events jsonb;
begin
  with candidates as (
    select event.id from public.cxm_pipeline_stage_events as event
    where event.status in ('queued', 'retrying')
       or (event.status = 'processing' and event.locked_until < now())
    order by event.created_at, event.id
    for update skip locked
    limit least(greatest(coalesce(p_qty, 25), 1), 100)
  ), claimed as (
    update public.cxm_pipeline_stage_events as event
    set status = 'processing', attempts = event.attempts + 1,
        locked_until = now() + make_interval(secs => least(greatest(coalesce(p_visibility_seconds, 120), 30), 600)),
        updated_at = now(), last_error = null
    from candidates where event.id = candidates.id
    returning event.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by claimed.created_at, claimed.id), '[]'::jsonb)
  into v_events from claimed;
  return v_events;
end;
$$;

create or replace function public.cxm_pipeline_stage_event_complete(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cxm_pipeline_stage_events
  set status = 'completed', locked_until = null, last_error = null,
      processed_at = coalesce(processed_at, now()), updated_at = now()
  where id = p_id and status = 'processing';
  return found;
end;
$$;

create or replace function public.cxm_pipeline_stage_event_fail(p_id uuid, p_error text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.cxm_pipeline_stage_events
  set status = case when attempts >= 5 then 'failed' else 'retrying' end,
      locked_until = null, last_error = left(coalesce(p_error, 'Falha ao executar automação de funil'), 500),
      updated_at = now()
  where id = p_id and status = 'processing'
  returning status into v_status;
  return coalesce(v_status, 'missing');
end;
$$;

revoke all on function public.cxm_pipeline_stage_event_claim(integer, integer) from public, anon, authenticated;
revoke all on function public.cxm_pipeline_stage_event_complete(uuid) from public, anon, authenticated;
revoke all on function public.cxm_pipeline_stage_event_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.cxm_pipeline_stage_event_claim(integer, integer) to service_role;
grant execute on function public.cxm_pipeline_stage_event_complete(uuid) to service_role;
grant execute on function public.cxm_pipeline_stage_event_fail(uuid, text) to service_role;
