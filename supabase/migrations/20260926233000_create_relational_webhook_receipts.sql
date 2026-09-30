-- Relational projection for the inbound webhook receipt ledger.
-- This table is append-only: the legacy receipt remains the audit source of truth.
create table if not exists public.maestro_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  legacy_record_id text not null,
  event_name text,
  instance_name text,
  received_at timestamptz not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists idx_maestro_webhook_receipts_org_time
  on public.maestro_webhook_receipts (organization_id, received_at desc);
create index if not exists idx_maestro_webhook_receipts_org_event
  on public.maestro_webhook_receipts (organization_id, event_name, received_at desc);

alter table public.maestro_webhook_receipts enable row level security;

insert into public.maestro_webhook_receipts (
  organization_id,
  legacy_record_id,
  event_name,
  instance_name,
  received_at,
  source_payload
)
select
  olr.organization_id,
  lr.record_id,
  nullif(lr.payload->>'event', ''),
  nullif(lr.payload->>'instance', ''),
  coalesce(nullif(lr.payload->>'received_at', '')::timestamptz, lr.source_created_at, lr.imported_at, now()),
  lr.payload
from public.legacy_records lr
join public.organization_legacy_records olr
  on olr.legacy_entity = lr.entity
 and olr.legacy_record_id = lr.record_id
where lr.entity = 'DominusWebhookReceipt'
on conflict (organization_id, legacy_record_id) do nothing;

create or replace function public.maestro_sync_relational_webhook_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  if new.entity <> 'DominusWebhookReceipt' then
    return new;
  end if;

  -- Never guess a tenant once more than one organization is active.
  select o.id into org_id
  from public.organizations o
  where o.status = 'active'
    and (select count(*) from public.organizations o2 where o2.status = 'active') = 1
  limit 1;

  if org_id is null then
    return new;
  end if;

  insert into public.maestro_webhook_receipts (
    organization_id,
    legacy_record_id,
    event_name,
    instance_name,
    received_at,
    source_payload
  ) values (
    org_id,
    new.record_id,
    nullif(new.payload->>'event', ''),
    nullif(new.payload->>'instance', ''),
    coalesce(nullif(new.payload->>'received_at', '')::timestamptz, new.source_created_at, new.imported_at, now()),
    new.payload
  ) on conflict (organization_id, legacy_record_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_maestro_sync_relational_webhook_receipt on public.legacy_records;
create trigger trg_maestro_sync_relational_webhook_receipt
after insert on public.legacy_records
for each row execute function public.maestro_sync_relational_webhook_receipt();
