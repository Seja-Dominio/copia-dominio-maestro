-- Safe first step of the Base44 -> Supabase migration.
-- This table is an import landing zone: it preserves source IDs and payloads
-- before domain tables and application writes are switched over.

create schema if not exists migration;

create table if not exists migration.base44_records (
  id bigint generated always as identity primary key,
  entity_name text not null,
  source_id text not null,
  payload jsonb not null,
  source_updated_at timestamptz,
  import_batch_id uuid not null,
  payload_hash text,
  imported_at timestamptz not null default now(),
  unique (entity_name, source_id)
);

create index if not exists base44_records_entity_idx
  on migration.base44_records (entity_name);

create index if not exists base44_records_batch_idx
  on migration.base44_records (import_batch_id);

alter table migration.base44_records enable row level security;

comment on table migration.base44_records is
  'Non-destructive landing zone for Base44 records during migration.';
