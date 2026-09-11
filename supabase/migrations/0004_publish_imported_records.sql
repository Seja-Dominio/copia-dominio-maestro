-- Publica a carga preservada em migration.base44_records para a API externa.
-- Idempotente: pode ser executada novamente sem duplicar ou apagar dados.

create table if not exists public.legacy_records (
  entity text not null,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  primary key (entity, record_id)
);

create index if not exists legacy_records_entity_idx
  on public.legacy_records (entity);

create index if not exists legacy_records_source_updated_idx
  on public.legacy_records (source_updated_at);

alter table public.legacy_records enable row level security;

drop policy if exists legacy_records_authenticated_read on public.legacy_records;
create policy legacy_records_authenticated_read
  on public.legacy_records for select
  to authenticated
  using (entity not in ('Collaborator', 'User'));

insert into public.legacy_records (
  entity,
  record_id,
  payload,
  source_created_at,
  source_updated_at
)
select
  entity_name,
  source_id,
  payload,
  nullif(payload->>'created_date', '')::timestamptz,
  source_updated_at
from migration.base44_records
where entity_name not in ('Collaborator', 'User')
on conflict (entity, record_id) do update set
  payload = excluded.payload,
  source_created_at = excluded.source_created_at,
  source_updated_at = excluded.source_updated_at,
  imported_at = now();
