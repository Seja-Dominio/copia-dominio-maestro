-- Append-only relational projection for JobHistory.
-- The legacy record remains the audit source of truth during the transition.
create table if not exists public.maestro_job_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  legacy_record_id text not null,
  job_legacy_id text,
  job_id uuid references public.maestro_jobs(id),
  collaborator_legacy_id text,
  event_type text,
  field_name text,
  old_value text,
  new_value text,
  message text,
  source_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists idx_maestro_job_history_org_job_time
  on public.maestro_job_history (organization_id, job_id, occurred_at desc);
create index if not exists idx_maestro_job_history_org_time
  on public.maestro_job_history (organization_id, occurred_at desc);

alter table public.maestro_job_history enable row level security;

insert into public.maestro_job_history (
  organization_id,
  legacy_record_id,
  job_legacy_id,
  job_id,
  collaborator_legacy_id,
  event_type,
  field_name,
  old_value,
  new_value,
  message,
  source_payload,
  occurred_at
)
select
  olr.organization_id,
  lr.record_id,
  nullif(lr.payload->>'job_id', ''),
  mj.id,
  nullif(lr.payload->>'collaborator_id', ''),
  nullif(lr.payload->>'type', ''),
  nullif(lr.payload->>'field', ''),
  lr.payload->>'old_value',
  lr.payload->>'new_value',
  lr.payload->>'text',
  lr.payload,
  coalesce(lr.source_created_at, lr.imported_at, now())
from public.legacy_records lr
join public.organization_legacy_records olr
  on olr.legacy_entity = lr.entity
 and olr.legacy_record_id = lr.record_id
left join public.maestro_jobs mj
  on mj.organization_id = olr.organization_id
 and mj.legacy_record_id = nullif(lr.payload->>'job_id', '')
where lr.entity = 'JobHistory'
on conflict (organization_id, legacy_record_id) do nothing;

create or replace function public.maestro_sync_relational_job_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  job_legacy text;
begin
  if new.entity <> 'JobHistory' then
    return new;
  end if;

  -- Do not guess a tenant when the account has more than one active org.
  select o.id into org_id
  from public.organizations o
  where o.status = 'active'
    and (select count(*) from public.organizations o2 where o2.status = 'active') = 1
  limit 1;

  if org_id is null then
    return new;
  end if;

  job_legacy := nullif(new.payload->>'job_id', '');

  insert into public.maestro_job_history (
    organization_id, legacy_record_id, job_legacy_id, job_id,
    collaborator_legacy_id, event_type, field_name, old_value, new_value,
    message, source_payload, occurred_at
  )
  select
    org_id,
    new.record_id,
    job_legacy,
    mj.id,
    nullif(new.payload->>'collaborator_id', ''),
    nullif(new.payload->>'type', ''),
    nullif(new.payload->>'field', ''),
    new.payload->>'old_value',
    new.payload->>'new_value',
    new.payload->>'text',
    new.payload,
    coalesce(new.source_created_at, new.imported_at, now())
  from (select 1) as ignored
  left join public.maestro_jobs mj
    on mj.organization_id = org_id
   and mj.legacy_record_id = job_legacy
  on conflict (organization_id, legacy_record_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_maestro_sync_relational_job_history on public.legacy_records;
create trigger trg_maestro_sync_relational_job_history
after insert on public.legacy_records
for each row execute function public.maestro_sync_relational_job_history();
