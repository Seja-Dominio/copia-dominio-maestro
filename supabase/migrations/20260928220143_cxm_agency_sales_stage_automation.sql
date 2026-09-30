-- Durable, isolated queue for the agency's own commercial pipeline.
create table public.cxm_agency_sales_stage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  opportunity_id text not null,
  stage_change_id text not null,
  from_stage text not null,
  to_stage text not null,
  actor_id text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retrying', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (organization_id, stage_change_id)
);

create index cxm_agency_sales_stage_events_claim_idx
  on public.cxm_agency_sales_stage_events (status, locked_until, created_at)
  where status in ('queued', 'retrying', 'processing');

alter table public.cxm_agency_sales_stage_events enable row level security;
revoke all on table public.cxm_agency_sales_stage_events from public, anon, authenticated;
grant select, insert, update, delete on table public.cxm_agency_sales_stage_events to service_role;

create or replace function public.maestro_enqueue_cxm_agency_sales_stage_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from text;
  v_to text;
  v_history jsonb;
  v_change_id text;
begin
  if tg_op <> 'UPDATE' or new.entity <> 'SalesOpportunity' or new.payload is null then return new; end if;
  if coalesce(new.payload ->> 'scope_type', 'agency') <> 'agency'
    or coalesce(new.payload ->> 'scope_id', 'dominio-performance') <> 'dominio-performance' then return new; end if;

  v_from := coalesce(old.payload ->> 'stage', 'new');
  v_to := coalesce(new.payload ->> 'stage', 'new');
  if v_from = v_to then return new; end if;

  v_history := new.payload -> 'stage_history';
  if jsonb_typeof(v_history) is distinct from 'array' then return new; end if;
  if jsonb_array_length(v_history) = 0 then return new; end if;
  if v_history -> -1 ->> 'from_stage' is distinct from v_from
    or v_history -> -1 ->> 'to_stage' is distinct from v_to
    or coalesce(v_history -> -1 ->> 'source', '') not in ('manual', 'undo') then return new; end if;
  v_change_id := nullif(btrim(v_history -> -1 ->> 'action_id'), '');
  if v_change_id is null then return new; end if;

  insert into public.cxm_agency_sales_stage_events (
    organization_id, opportunity_id, stage_change_id, from_stage, to_stage, actor_id
  ) values (
    new.organization_id, new.record_id, v_change_id, v_from, v_to,
    nullif(v_history -> -1 ->> 'actor_id', '')
  ) on conflict (organization_id, stage_change_id) do nothing;
  return new;
end;
$$;

revoke all on function public.maestro_enqueue_cxm_agency_sales_stage_event() from public, anon, authenticated;
grant execute on function public.maestro_enqueue_cxm_agency_sales_stage_event() to service_role;
drop trigger if exists maestro_cxm_agency_sales_stage_event on public.legacy_records;
create trigger maestro_cxm_agency_sales_stage_event
  after update of payload on public.legacy_records
  for each row
  when (old.entity = 'SalesOpportunity' and new.entity = 'SalesOpportunity')
  execute function public.maestro_enqueue_cxm_agency_sales_stage_event();

create or replace function public.cxm_agency_sales_stage_event_claim(p_qty integer default 25, p_visibility_seconds integer default 120)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_events jsonb;
begin
  with candidates as (
    select event.id from public.cxm_agency_sales_stage_events as event
    where event.status in ('queued', 'retrying') or (event.status = 'processing' and event.locked_until < now())
    order by event.created_at, event.id for update skip locked
    limit least(greatest(coalesce(p_qty, 25), 1), 100)
  ), claimed as (
    update public.cxm_agency_sales_stage_events as event
    set status = 'processing', attempts = event.attempts + 1,
        locked_until = now() + make_interval(secs => least(greatest(coalesce(p_visibility_seconds, 120), 30), 600)),
        updated_at = now(), last_error = null
    from candidates where event.id = candidates.id returning event.*
  ) select coalesce(jsonb_agg(to_jsonb(claimed) order by claimed.created_at, claimed.id), '[]'::jsonb)
    into v_events from claimed;
  return v_events;
end;
$$;

create or replace function public.cxm_agency_sales_stage_event_complete(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.cxm_agency_sales_stage_events set status = 'completed', locked_until = null,
    last_error = null, processed_at = coalesce(processed_at, now()), updated_at = now()
  where id = p_id and status = 'processing';
  return found;
end;
$$;

create or replace function public.cxm_agency_sales_stage_event_fail(p_id uuid, p_error text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  update public.cxm_agency_sales_stage_events set
    status = case when attempts >= 5 then 'failed' else 'retrying' end,
    locked_until = null, last_error = left(coalesce(p_error, 'Falha ao executar automação comercial'), 500), updated_at = now()
  where id = p_id and status = 'processing' returning status into v_status;
  return coalesce(v_status, 'missing');
end;
$$;

revoke all on function public.cxm_agency_sales_stage_event_claim(integer, integer) from public, anon, authenticated;
revoke all on function public.cxm_agency_sales_stage_event_complete(uuid) from public, anon, authenticated;
revoke all on function public.cxm_agency_sales_stage_event_fail(uuid, text) from public, anon, authenticated;
grant execute on function public.cxm_agency_sales_stage_event_claim(integer, integer) to service_role;
grant execute on function public.cxm_agency_sales_stage_event_complete(uuid) to service_role;
grant execute on function public.cxm_agency_sales_stage_event_fail(uuid, text) to service_role;
