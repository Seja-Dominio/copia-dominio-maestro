create table public.cxm_silence_due_jobs (
  id text primary key,
  client_id text not null,
  scope_type text not null default 'client' check (scope_type = 'client'),
  scope_id text not null,
  channel text not null check (channel in ('whatsapp', 'instagram', 'messenger')),
  account_id text not null,
  conversation_id text not null,
  rule_id text not null,
  trigger_message_id text not null,
  trigger_message_record_id text not null,
  trigger_created_at timestamptz not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  action_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cxm_silence_due_jobs_scope_matches_client check (scope_id = client_id),
  constraint cxm_silence_due_jobs_event_unique unique (client_id, channel, account_id, conversation_id, rule_id, trigger_message_id)
);

create index cxm_silence_due_jobs_pending_due_idx
  on public.cxm_silence_due_jobs (due_at, created_at)
  where status = 'pending';

create index cxm_silence_due_jobs_processing_lock_idx
  on public.cxm_silence_due_jobs (locked_until)
  where status = 'processing';

create index cxm_silence_due_jobs_conversation_pending_idx
  on public.cxm_silence_due_jobs (client_id, channel, account_id, conversation_id)
  where status in ('pending', 'processing');

alter table public.cxm_silence_due_jobs enable row level security;
revoke all on table public.cxm_silence_due_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.cxm_silence_due_jobs to service_role;

create or replace function public.cxm_silence_due_claim(p_qty integer default 100, p_visibility_seconds integer default 120)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jobs jsonb;
begin
  with candidates as (
    select job.id
    from public.cxm_silence_due_jobs as job
    where (job.status = 'pending' and job.due_at <= now())
       or (job.status = 'processing' and job.locked_until <= now())
    order by job.due_at, job.created_at
    for update skip locked
    limit least(greatest(coalesce(p_qty, 100), 1), 100)
  ), claimed as (
    update public.cxm_silence_due_jobs as job
    set status = 'processing',
        attempts = job.attempts + 1,
        locked_until = now() + make_interval(secs => least(greatest(coalesce(p_visibility_seconds, 120), 30), 600)),
        updated_at = now(),
        last_error = null
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select coalesce(jsonb_agg(to_jsonb(claimed) order by claimed.due_at, claimed.created_at), '[]'::jsonb)
  into v_jobs
  from claimed;

  return v_jobs;
end;
$$;

create or replace function public.cxm_silence_due_fail(p_id text, p_error text)
returns text
language sql
security definer
set search_path = ''
as $$
  update public.cxm_silence_due_jobs
  set status = case when attempts >= 5 then 'failed' else 'pending' end,
      locked_until = null,
      last_error = left(coalesce(nullif(p_error, ''), 'Falha não detalhada'), 500),
      updated_at = now()
  where id = p_id and status = 'processing'
  returning status;
$$;

revoke all on function public.cxm_silence_due_claim(integer, integer) from public, anon, authenticated;
revoke all on function public.cxm_silence_due_fail(text, text) from public, anon, authenticated;
grant execute on function public.cxm_silence_due_claim(integer, integer) to service_role;
grant execute on function public.cxm_silence_due_fail(text, text) to service_role;
