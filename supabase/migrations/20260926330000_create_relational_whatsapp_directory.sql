create table if not exists public.maestro_whatsapp_contacts (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null,
  instance text not null,
  name text not null default '',
  phone text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, instance, external_id)
);

create table if not exists public.maestro_whatsapp_groups (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text not null,
  instance text not null,
  name text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, instance, external_id)
);

create index if not exists maestro_whatsapp_contacts_scope_idx on public.maestro_whatsapp_contacts (organization_id, instance, updated_at desc);
create index if not exists maestro_whatsapp_groups_scope_idx on public.maestro_whatsapp_groups (organization_id, instance, updated_at desc);

alter table public.maestro_whatsapp_contacts enable row level security;
alter table public.maestro_whatsapp_groups enable row level security;

insert into public.maestro_whatsapp_contacts (legacy_record_id, organization_id, external_id, instance, name, phone, payload, source_updated_at, created_at, updated_at)
select record_id, organization_id, coalesce(nullif(payload->>'id',''), record_id), coalesce(payload->>'instance',''), coalesce(payload->>'name',''), coalesce(payload->>'phone',''), payload, source_updated_at, coalesce(source_created_at, now()), coalesce(source_updated_at, source_created_at, now())
from public.legacy_records where entity='WhatsappContact'
on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, external_id=excluded.external_id, instance=excluded.instance, name=excluded.name, phone=excluded.phone, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();

insert into public.maestro_whatsapp_groups (legacy_record_id, organization_id, external_id, instance, name, payload, source_updated_at, created_at, updated_at)
select record_id, organization_id, coalesce(nullif(payload->>'id',''), record_id), coalesce(payload->>'instance',''), coalesce(payload->>'name',''), payload, source_updated_at, coalesce(source_created_at, now()), coalesce(source_updated_at, source_created_at, now())
from public.legacy_records where entity='WhatsappGroup'
on conflict (legacy_record_id) do update set organization_id=excluded.organization_id, external_id=excluded.external_id, instance=excluded.instance, name=excluded.name, payload=excluded.payload, source_updated_at=excluded.source_updated_at, updated_at=now();
