-- Núcleo relacional de notificações por organização e colaborador.

create table if not exists public.maestro_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  user_id text,
  type text,
  title text not null,
  message text,
  is_read boolean not null default false,
  entity_type text,
  entity_id text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_notifications_org_user_idx
  on public.maestro_notifications (organization_id, user_id, is_read, created_at desc);
create index if not exists maestro_notifications_org_entity_idx
  on public.maestro_notifications (organization_id, entity_type, entity_id);

alter table public.maestro_notifications enable row level security;

insert into public.maestro_notifications (
  organization_id, legacy_record_id, user_id, type, title, message, is_read,
  entity_type, entity_id, source_payload, created_at, updated_at
)
select
  s.organization_id,
  l.record_id,
  l.payload ->> 'user_id',
  l.payload ->> 'type',
  coalesce(nullif(l.payload ->> 'title', ''), 'Notificação'),
  l.payload ->> 'message',
  case when l.payload ? 'is_read' then (l.payload ->> 'is_read')::boolean else false end,
  l.payload ->> 'entity_type',
  l.payload ->> 'entity_id',
  l.payload,
  coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity and l.record_id = s.legacy_record_id
where s.legacy_entity = 'Notification' and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

comment on table public.maestro_notifications is
  'Núcleo relacional de notificações, sempre escopado à organização e ao usuário destinatário.';
