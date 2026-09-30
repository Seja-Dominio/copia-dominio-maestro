-- Prepara o isolamento organizacional dos dados legados sem alterar as leituras atuais.
-- Cada vínculo pode ser revisado antes de qualquer filtro obrigatório por tenant.

create table if not exists public.organization_legacy_records (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  legacy_entity text not null,
  legacy_record_id text not null,
  scope_status text not null default 'confirmed'
    check (scope_status in ('confirmed', 'pending_review', 'excluded')),
  source text not null default 'backfill',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, legacy_entity, legacy_record_id)
);

create index if not exists organization_legacy_records_lookup_idx
  on public.organization_legacy_records (legacy_entity, legacy_record_id);

create index if not exists organization_legacy_records_scope_idx
  on public.organization_legacy_records (organization_id, scope_status);

alter table public.organization_legacy_records enable row level security;

-- Hoje existe uma única organização operacional. O backfill é explícito e
-- reversível: a tabela de escopo pode ser revisada antes de ativar filtros.
insert into public.organization_legacy_records (
  organization_id,
  legacy_entity,
  legacy_record_id,
  scope_status,
  source
)
select
  o.id,
  l.entity,
  l.record_id,
  'confirmed',
  'single-organization-backfill'
from public.organizations o
cross join public.legacy_records l
where o.slug = 'dominio-performance'
on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

comment on table public.organization_legacy_records is
  'Mapa de escopo organizacional para registros legados; não é consumido por filtros obrigatórios até a validação do domínio.';
