-- Dimensões relacionais do Financeiro.

create table if not exists public.maestro_bank_accounts (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default '',
  bank_name text not null default '',
  account_type text not null default 'checking',
  color text not null default '#2563eb',
  balance numeric(14, 2) not null default 0,
  is_active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create table if not exists public.maestro_financial_categories (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default '',
  category_type text not null default 'expense',
  display_order integer not null default 0,
  is_active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create table if not exists public.maestro_cost_centers (
  legacy_record_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default '',
  description text not null default '',
  color text not null default '#2563eb',
  is_active boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_bank_accounts_org_active_idx
  on public.maestro_bank_accounts (organization_id, is_active, name);
create index if not exists maestro_financial_categories_org_active_idx
  on public.maestro_financial_categories (organization_id, is_active, display_order);
create index if not exists maestro_cost_centers_org_active_idx
  on public.maestro_cost_centers (organization_id, is_active, name);

alter table public.maestro_bank_accounts enable row level security;
alter table public.maestro_financial_categories enable row level security;
alter table public.maestro_cost_centers enable row level security;

insert into public.maestro_bank_accounts (
  legacy_record_id, organization_id, name, bank_name, account_type, color, balance,
  is_active, payload, source_updated_at, created_at, updated_at
)
select l.record_id, s.organization_id,
  coalesce(l.payload ->> 'name', ''), coalesce(l.payload ->> 'bank_name', ''),
  coalesce(l.payload ->> 'account_type', 'checking'), coalesce(l.payload ->> 'color', '#2563eb'),
  case when l.payload ->> 'balance' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(l.payload ->> 'balance', ',', '.')::numeric(14,2) else 0 end,
  coalesce((l.payload ->> 'is_active')::boolean, true), l.payload,
  l.source_updated_at, coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l on l.entity = s.legacy_entity and l.record_id = s.legacy_record_id
where s.legacy_entity = 'BankAccount' and s.scope_status = 'confirmed'
on conflict (legacy_record_id) do nothing;

insert into public.maestro_financial_categories (
  legacy_record_id, organization_id, name, category_type, display_order,
  is_active, payload, source_updated_at, created_at, updated_at
)
select l.record_id, s.organization_id, coalesce(l.payload ->> 'name', ''),
  coalesce(l.payload ->> 'type', l.payload ->> 'category_type', 'expense'),
  coalesce((l.payload ->> 'order')::integer, 0), coalesce((l.payload ->> 'is_active')::boolean, true),
  l.payload, l.source_updated_at, coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l on l.entity = s.legacy_entity and l.record_id = s.legacy_record_id
where s.legacy_entity = 'FinancialCategory' and s.scope_status = 'confirmed'
on conflict (legacy_record_id) do nothing;

insert into public.maestro_cost_centers (
  legacy_record_id, organization_id, name, description, color,
  is_active, payload, source_updated_at, created_at, updated_at
)
select l.record_id, s.organization_id, coalesce(l.payload ->> 'name', ''),
  coalesce(l.payload ->> 'description', ''), coalesce(l.payload ->> 'color', '#2563eb'),
  coalesce((l.payload ->> 'is_active')::boolean, true), l.payload, l.source_updated_at,
  coalesce(l.source_created_at, now()), coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l on l.entity = s.legacy_entity and l.record_id = s.legacy_record_id
where s.legacy_entity = 'CostCenter' and s.scope_status = 'confirmed'
on conflict (legacy_record_id) do nothing;

comment on table public.maestro_bank_accounts is 'Contas bancárias do Financeiro, isoladas por organização.';
comment on table public.maestro_financial_categories is 'Categorias personalizadas do Financeiro, isoladas por organização.';
comment on table public.maestro_cost_centers is 'Centros de custo do Financeiro, isolados por organização.';
