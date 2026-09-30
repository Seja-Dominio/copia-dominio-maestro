create table public.cxm_assignment_cursors (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id text not null check (length(btrim(client_id)) > 0),
  rule_id text not null check (length(btrim(rule_id)) > 0),
  last_assignee_id text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, client_id, rule_id)
);

create table public.cxm_assignment_reservations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id text not null check (length(btrim(client_id)) > 0),
  rule_id text not null check (length(btrim(rule_id)) > 0),
  action_id text not null check (length(btrim(action_id)) > 0),
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  account_id text not null check (length(btrim(account_id)) > 0),
  conversation_id text not null check (length(btrim(conversation_id)) > 0),
  evidence_message_id text not null check (length(btrim(evidence_message_id)) > 0),
  assignee_id text not null check (length(btrim(assignee_id)) > 0),
  created_at timestamptz not null default now(),
  primary key (organization_id, client_id, rule_id, action_id)
);

alter table public.cxm_assignment_cursors enable row level security;
alter table public.cxm_assignment_reservations enable row level security;
revoke all on table public.cxm_assignment_cursors from public, anon, authenticated;
revoke all on table public.cxm_assignment_reservations from public, anon, authenticated;
grant select, insert, update on table public.cxm_assignment_cursors to service_role;
grant select, insert on table public.cxm_assignment_reservations to service_role;

create or replace function public.cxm_assignment_round_robin(
  p_organization_id uuid,
  p_client_id text,
  p_rule_id text,
  p_action_id text,
  p_channel text,
  p_account_id text,
  p_conversation_id text,
  p_evidence_message_id text,
  p_candidate_ids text[]
)
returns text
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_rule jsonb;
  v_candidates text[];
  v_last_assignee_id text;
  v_assignee_id text;
  v_existing cxm_assignment_reservations%rowtype;
  v_position integer;
begin
  if p_organization_id is null
    or nullif(btrim(p_client_id), '') is null
    or nullif(btrim(p_rule_id), '') is null
    or nullif(btrim(p_action_id), '') is null
    or coalesce(p_channel, '') not in ('whatsapp', 'instagram', 'messenger')
    or nullif(btrim(p_account_id), '') is null
    or nullif(btrim(p_conversation_id), '') is null
    or nullif(btrim(p_evidence_message_id), '') is null
    or coalesce(cardinality(p_candidate_ids), 0) < 2
    or cardinality(p_candidate_ids) > 50
    or exists (select 1 from unnest(p_candidate_ids) candidate where nullif(btrim(candidate), '') is null)
  then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_client_id || ':' || p_rule_id,
    0
  ));

  select payload into v_rule
  from public.legacy_records
  where entity = 'CXMAutomationRule'
    and record_id = p_rule_id
    and organization_id = p_organization_id
    and payload->>'client_id' = p_client_id
    and payload->>'scope_type' = 'client'
    and payload->>'scope_id' = p_client_id
    and payload->>'enabled' = 'true'
    and payload->>'status' = 'active'
    and payload->>'mode' = 'automation';
  if v_rule is null
    or coalesce(v_rule->'action'->>'type', '') <> 'assign'
    or coalesce(v_rule->'action'->>'strategy', '') <> 'round_robin'
    or coalesce(v_rule->'trigger'->>'type', '') not in ('keyword', 'silence')
    or coalesce(v_rule->'action'->'assignee_ids', 'null'::jsonb) <> to_jsonb(p_candidate_ids)
  then
    return null;
  end if;

  if not exists (
    select 1
    from public.legacy_records message
    where message.entity = 'AttendanceMessage'
      and message.record_id = p_evidence_message_id
      and message.organization_id = p_organization_id
      and message.payload->>'scope_type' = 'client'
      and message.payload->>'scope_id' = p_client_id
      and message.payload->>'client_id' = p_client_id
      and message.payload->>'channel' = p_channel
      and coalesce(message.payload->>'instance', message.payload->>'account_id', '') = p_account_id
      and message.payload->>'conversation_id' = p_conversation_id
  ) then
    return null;
  end if;

  select array_agg(eligible.collaborator_id order by eligible.position)
  into v_candidates
  from (
    select membership.collaborator_id, min(candidate.ordinality) as position
    from unnest(p_candidate_ids) with ordinality as candidate(collaborator_id, ordinality)
    join public.organization_members membership
      on membership.organization_id = p_organization_id
      and membership.collaborator_id = candidate.collaborator_id
      and membership.status = 'active'
    join public.maestro_collaborators collaborator
      on collaborator.id = membership.collaborator_id
      and collaborator.is_active = true
    group by membership.collaborator_id
  ) eligible;
  if coalesce(cardinality(v_candidates), 0) < 1 then
    return null;
  end if;

  select * into v_existing
  from public.cxm_assignment_reservations
  where organization_id = p_organization_id
    and client_id = p_client_id
    and rule_id = p_rule_id
    and action_id = p_action_id;
  if found then
    if v_existing.channel <> p_channel
      or v_existing.account_id <> p_account_id
      or v_existing.conversation_id <> p_conversation_id
      or v_existing.evidence_message_id <> p_evidence_message_id
      or not (v_existing.assignee_id = any(v_candidates))
    then
      return null;
    end if;
    return v_existing.assignee_id;
  end if;

  select last_assignee_id into v_last_assignee_id
  from public.cxm_assignment_cursors
  where organization_id = p_organization_id
    and client_id = p_client_id
    and rule_id = p_rule_id;
  v_position := array_position(v_candidates, v_last_assignee_id);
  if v_position is null or v_position >= cardinality(v_candidates) then
    v_assignee_id := v_candidates[1];
  else
    v_assignee_id := v_candidates[v_position + 1];
  end if;

  insert into public.cxm_assignment_cursors (organization_id, client_id, rule_id, last_assignee_id, updated_at)
  values (p_organization_id, p_client_id, p_rule_id, v_assignee_id, now())
  on conflict (organization_id, client_id, rule_id)
  do update set last_assignee_id = excluded.last_assignee_id, updated_at = excluded.updated_at;

  insert into public.cxm_assignment_reservations (
    organization_id, client_id, rule_id, action_id, channel, account_id,
    conversation_id, evidence_message_id, assignee_id
  ) values (
    p_organization_id, p_client_id, p_rule_id, p_action_id, p_channel, p_account_id,
    p_conversation_id, p_evidence_message_id, v_assignee_id
  );
  return v_assignee_id;
end;
$$;

revoke all on function public.cxm_assignment_round_robin(uuid, text, text, text, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.cxm_assignment_round_robin(uuid, text, text, text, text, text, text, text, text[]) to service_role;

comment on table public.cxm_assignment_cursors is
  'Cursor de distribuição round-robin por organização, cliente e regra CXM; acessível somente ao backend.';
comment on table public.cxm_assignment_reservations is
  'Reserva idempotente de responsável por execução e conversa CXM para retries concorrentes do webhook.';
