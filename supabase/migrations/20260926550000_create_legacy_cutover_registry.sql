-- Registro operacional do desligamento gradual do legacy_records.
-- Nenhuma entidade é desligada por esta migration; ela apenas torna o corte
-- explícito, auditável e reversível.
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

comment on table public.legacy_cutover_registry is
  'Gate operacional para migração progressiva de legacy_records para tabelas relacionais.';

insert into public.legacy_cutover_registry
  (entity, module_key, relational_table, read_mode, write_mode, legacy_read_allowed, legacy_write_allowed, status, evidence)
values
  ('Client', 'maestro', 'maestro_clients', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('Project', 'maestro', 'maestro_projects', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('Job', 'maestro', 'maestro_jobs', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('Subtask', 'maestro', 'maestro_job_tasks', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('FinancialEntry', 'maestro', 'maestro_financial_entries', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('AgendaEvent', 'maestro', 'maestro_agenda_events', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('Timesheet', 'maestro', 'maestro_timesheets', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('Notification', 'maestro', 'maestro_notifications', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('JobTemplate', 'maestro', 'maestro_job_templates', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('Proposal', 'cxm', 'maestro_proposals', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('Note', 'maestro', 'maestro_notes', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('BankAccount', 'maestro', 'maestro_bank_accounts', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('FinancialCategory', 'maestro', 'maestro_financial_categories', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('CostCenter', 'maestro', 'maestro_cost_centers', 'relational', 'dual', true, true, 'candidate', 'Frontend relacional ativo; dual-write preservado até observabilidade contínua.'),
  ('WhatsappContact', 'cxm', 'maestro_whatsapp_contacts', 'dual', 'dual', true, true, 'dual_write', 'Tabela relacional sincronizada; frontend ainda não é exclusivamente relacional.'),
  ('WhatsappGroup', 'cxm', 'maestro_whatsapp_groups', 'dual', 'dual', true, true, 'dual_write', 'Tabela relacional sincronizada; frontend ainda não é exclusivamente relacional.'),
  ('NpsEntry', 'insights', 'maestro_nps_entries', 'dual', 'dual', true, true, 'dual_write', 'Tabela relacional sincronizada; frontend ainda não é exclusivamente relacional.'),
  ('NpsHistory', 'insights', 'maestro_nps_history', 'dual', 'dual', true, true, 'dual_write', 'Tabela relacional sincronizada; frontend ainda não é exclusivamente relacional.'),
  ('Comment', 'maestro', 'maestro_job_comments', 'dual', 'dual', true, true, 'dual_write', 'Tabela relacional sincronizada; frontend ainda não é exclusivamente relacional.'),
  ('DominusWebhookParsed', 'maestro', 'maestro_webhook_parsed_messages', 'dual', 'dual', true, true, 'dual_write', 'Tabela relacional sincronizada; frontend ainda não é exclusivamente relacional.'),
  ('WhatsappAutomation', 'cxm', 'maestro_whatsapp_automations', 'dual', 'dual', true, true, 'dual_write', 'Tabela relacional sincronizada; frontend ainda não é exclusivamente relacional.')
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

alter table public.legacy_cutover_registry enable row level security;
revoke all on public.legacy_cutover_registry from anon, authenticated;
grant select on public.legacy_cutover_registry to service_role;
