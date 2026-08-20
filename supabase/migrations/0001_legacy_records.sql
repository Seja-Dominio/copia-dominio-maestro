-- Base44 -> Supabase: camada inicial de compatibilidade.
-- Mantém o ID e o payload original para permitir migração incremental.

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

-- Escrita fica restrita ao backend/importador com service role.
-- O service role ignora RLS; o frontend não pode alterar o acervo legado diretamente.
