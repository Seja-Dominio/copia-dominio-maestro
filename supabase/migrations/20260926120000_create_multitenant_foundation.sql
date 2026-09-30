-- Fundação multiempresa do Maestro.
-- Esta migration é aditiva: não altera legacy_records nem muda o comportamento
-- das funções atuais. O backfill dos colaboradores será feito em etapa separada.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  metadata jsonb not null default '{}'::jsonb,
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists organizations_slug_unique_idx
  on public.organizations (lower(slug));

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  collaborator_id text not null references public.maestro_collaborators(id) on delete restrict,
  role text not null default 'member' check (role in ('owner', 'admin', 'manager', 'member', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, collaborator_id)
);

create index if not exists organization_members_collaborator_idx
  on public.organization_members (collaborator_id, status);

create table if not exists public.organization_products (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_key text not null check (product_key in ('maestro', 'cxm', 'ads_brain', 'insights')),
  status text not null default 'enabled' check (status in ('trial', 'enabled', 'suspended', 'cancelled')),
  plan_key text,
  limits jsonb not null default '{}'::jsonb,
  enabled_at timestamptz not null default now(),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, product_key)
);

create index if not exists organization_products_status_idx
  on public.organization_products (product_key, status);

-- Estas tabelas ainda não são consumidas pelo frontend. O acesso permanece
-- restrito ao backend até definirmos o mecanismo de autorização organizacional
-- compatível com as sessões legadas e o Supabase Auth.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_products enable row level security;

comment on table public.organizations is 'Tenant raiz da plataforma Maestro.';
comment on table public.organization_members is 'Vínculo entre organizações e colaboradores do Maestro.';
comment on table public.organization_products is 'Módulos e produtos habilitados por organização.';
