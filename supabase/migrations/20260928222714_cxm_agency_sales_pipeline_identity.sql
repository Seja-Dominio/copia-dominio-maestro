alter table public.cxm_agency_sales_stage_events
  add column if not exists pipeline_id text not null default 'agency-default';

alter table public.cxm_agency_sales_stage_events
  add constraint cxm_agency_sales_stage_events_pipeline_id_check
  check (length(pipeline_id) between 1 and 80);

create or replace function public.maestro_enqueue_cxm_agency_sales_stage_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from text;
  v_to text;
  v_pipeline_id text;
  v_history jsonb;
  v_change_id text;
begin
  if tg_op <> 'UPDATE' or new.entity <> 'SalesOpportunity' or new.payload is null then return new; end if;
  if coalesce(new.payload ->> 'scope_type', 'agency') <> 'agency'
    or coalesce(new.payload ->> 'scope_id', 'dominio-performance') <> 'dominio-performance' then return new; end if;

  v_from := coalesce(old.payload ->> 'stage', 'new');
  v_to := coalesce(new.payload ->> 'stage', 'new');
  if v_from = v_to then return new; end if;
  v_pipeline_id := coalesce(nullif(btrim(new.payload ->> 'pipeline_id'), ''), 'agency-default');

  v_history := new.payload -> 'stage_history';
  if jsonb_typeof(v_history) is distinct from 'array' then return new; end if;
  if jsonb_array_length(v_history) = 0 then return new; end if;
  if v_history -> -1 ->> 'from_stage' is distinct from v_from
    or v_history -> -1 ->> 'to_stage' is distinct from v_to
    or coalesce(v_history -> -1 ->> 'source', '') not in ('manual', 'undo') then return new; end if;
  v_change_id := nullif(btrim(v_history -> -1 ->> 'action_id'), '');
  if v_change_id is null then return new; end if;

  insert into public.cxm_agency_sales_stage_events (
    organization_id, opportunity_id, pipeline_id, stage_change_id, from_stage, to_stage, actor_id
  ) values (
    new.organization_id, new.record_id, v_pipeline_id, v_change_id, v_from, v_to,
    nullif(v_history -> -1 ->> 'actor_id', '')
  ) on conflict (organization_id, stage_change_id) do nothing;
  return new;
end;
$$;

revoke all on function public.maestro_enqueue_cxm_agency_sales_stage_event() from public, anon, authenticated;
grant execute on function public.maestro_enqueue_cxm_agency_sales_stage_event() to service_role;
