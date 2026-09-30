-- Núcleo relacional de agenda.

create table if not exists public.maestro_agenda_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  client_legacy_record_id text,
  title text not null,
  event_date date,
  start_time time,
  end_time time,
  status text,
  activity_type text,
  collaborator_id text,
  collaborator_name text,
  notes text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_agenda_events_org_date_idx
  on public.maestro_agenda_events (organization_id, event_date, status);
create index if not exists maestro_agenda_events_org_client_idx
  on public.maestro_agenda_events (organization_id, client_legacy_record_id);

alter table public.maestro_agenda_events enable row level security;

insert into public.maestro_agenda_events (
  organization_id, legacy_record_id, client_legacy_record_id, title, event_date, start_time,
  end_time, status, activity_type, collaborator_id, collaborator_name, notes,
  source_payload, created_at, updated_at
)
select
  s.organization_id,
  l.record_id,
  l.payload ->> 'client_id',
  coalesce(nullif(l.payload ->> 'title', ''), 'Evento sem título'),
  case when l.payload ->> 'date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'date')::date else null end,
  case when l.payload ->> 'time' ~ '^\\d{2}:\\d{2}' then (l.payload ->> 'time')::time else null end,
  case when l.payload ->> 'end_time' ~ '^\\d{2}:\\d{2}' then (l.payload ->> 'end_time')::time else null end,
  l.payload ->> 'status', l.payload ->> 'activity_type', l.payload ->> 'collaborator_id',
  l.payload ->> 'collaborator_name', l.payload ->> 'notes', l.payload,
  coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity and l.record_id = s.legacy_record_id
where s.legacy_entity = 'AgendaEvent' and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

comment on table public.maestro_agenda_events is
  'Núcleo relacional da agenda; o legado permanece como compatibilidade durante a migração.';
