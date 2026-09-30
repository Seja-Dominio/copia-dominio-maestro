-- Enable only the non-CXM core entities for the already-built relational
-- read/write path. CXM and adjacent modules are deliberately not seeded here.
create table if not exists public.legacy_cutover_registry (
  entity text primary key,
  module_key text not null check (module_key in ('maestro', 'cxm', 'ads_brain', 'insights')),
  relational_table text,
  read_mode text not null check (read_mode in ('legacy', 'dual', 'relational')),
  write_mode text not null check (write_mode in ('legacy', 'dual', 'relational')),
  legacy_read_allowed boolean not null default true,
  legacy_write_allowed boolean not null default true,
  status text not null check (status in ('dual_write', 'candidate', 'frozen', 'retired')),
  evidence text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.legacy_cutover_registry enable row level security;
revoke all on public.legacy_cutover_registry from anon, authenticated;
grant select on public.legacy_cutover_registry to service_role;

insert into public.legacy_cutover_registry
  (entity, module_key, relational_table, read_mode, write_mode, legacy_read_allowed,
   legacy_write_allowed, status, evidence)
values
  ('Project', 'maestro', 'maestro_projects', 'relational', 'relational', true, false, 'frozen',
   'Core-only release: relational reads/writes enabled after Dev backfill and validation.'),
  ('Job', 'maestro', 'maestro_jobs', 'relational', 'relational', true, false, 'frozen',
   'Core-only release: relational writes use the atomic job/history RPC.'),
  ('Subtask', 'maestro', 'maestro_job_tasks', 'relational', 'relational', true, false, 'frozen',
   'Core-only release: relational writes use the atomic task/history RPC.'),
  ('FinancialEntry', 'maestro', 'maestro_financial_entries', 'relational', 'relational', true, false, 'frozen',
   'Core-only release: relational reads/writes enabled after Dev backfill and validation.')
on conflict (entity) do update set
  module_key = excluded.module_key,
  relational_table = excluded.relational_table,
  read_mode = excluded.read_mode,
  write_mode = excluded.write_mode,
  legacy_read_allowed = excluded.legacy_read_allowed,
  legacy_write_allowed = excluded.legacy_write_allowed,
  status = excluded.status,
  evidence = excluded.evidence,
  updated_at = now();
