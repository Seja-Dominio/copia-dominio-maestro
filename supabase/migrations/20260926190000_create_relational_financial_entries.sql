-- Núcleo relacional inicial do Financeiro.

create table if not exists public.maestro_financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  legacy_record_id text not null,
  client_legacy_record_id text,
  type text,
  title text not null,
  amount numeric(14, 2),
  status text,
  category text,
  subcategory_id text,
  subcategory_name text,
  cost_center text,
  bank_account_id text,
  bank_account_name text,
  due_date date,
  competence_date date,
  billing_date date,
  payment_date date,
  notes text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, legacy_record_id)
);

create index if not exists maestro_financial_entries_org_dates_idx
  on public.maestro_financial_entries (organization_id, competence_date, due_date);
create index if not exists maestro_financial_entries_org_status_idx
  on public.maestro_financial_entries (organization_id, status, type);
create index if not exists maestro_financial_entries_org_client_idx
  on public.maestro_financial_entries (organization_id, client_legacy_record_id);

alter table public.maestro_financial_entries enable row level security;

insert into public.maestro_financial_entries (
  organization_id, legacy_record_id, client_legacy_record_id, type, title, amount, status,
  category, subcategory_id, subcategory_name, cost_center, bank_account_id, bank_account_name,
  due_date, competence_date, billing_date, payment_date, notes, source_payload, created_at, updated_at
)
select
  s.organization_id,
  l.record_id,
  l.payload ->> 'client_id',
  l.payload ->> 'type',
  coalesce(nullif(l.payload ->> 'title', ''), 'Lançamento sem título'),
  case when l.payload ->> 'amount' ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(l.payload ->> 'amount', ',', '.')::numeric(14, 2) else null end,
  l.payload ->> 'status',
  l.payload ->> 'category',
  l.payload ->> 'subcategory_id',
  l.payload ->> 'subcategory_name',
  l.payload ->> 'cost_center',
  l.payload ->> 'bank_account_id',
  l.payload ->> 'bank_account_name',
  case when l.payload ->> 'due_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'due_date')::date else null end,
  case when l.payload ->> 'competence_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'competence_date')::date else null end,
  case when l.payload ->> 'billing_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'billing_date')::date else null end,
  case when l.payload ->> 'payment_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (l.payload ->> 'payment_date')::date else null end,
  l.payload ->> 'notes',
  l.payload,
  coalesce(l.source_created_at, now()),
  coalesce(l.source_updated_at, now())
from public.organization_legacy_records s
join public.legacy_records l
  on l.entity = s.legacy_entity
 and l.record_id = s.legacy_record_id
where s.legacy_entity = 'FinancialEntry'
  and s.scope_status = 'confirmed'
on conflict (organization_id, legacy_record_id) do nothing;

comment on table public.maestro_financial_entries is
  'Núcleo relacional financeiro; o legado permanece como fonte compatível durante a migração.';
