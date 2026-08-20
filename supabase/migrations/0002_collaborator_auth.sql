-- Autenticação legada de colaboradores, isolada do payload público de migração.
-- A tabela não possui política para o frontend: somente a Edge Function com
-- service role pode ler o hash de senha.

create table if not exists public.maestro_collaborators (
  id text primary key,
  login text not null,
  password_hash text not null default '',
  is_active boolean not null default true,
  profile jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now()
);

create unique index if not exists maestro_collaborators_login_lower_idx
  on public.maestro_collaborators (lower(login));

alter table public.maestro_collaborators enable row level security;

-- O payload completo de Collaborator contém password_hash e não deve ser
-- exposto via legacy_records ao frontend autenticado.
drop policy if exists legacy_records_authenticated_read on public.legacy_records;
create policy legacy_records_authenticated_read
  on public.legacy_records for select
  to authenticated
  using (entity not in ('Collaborator', 'User'));
