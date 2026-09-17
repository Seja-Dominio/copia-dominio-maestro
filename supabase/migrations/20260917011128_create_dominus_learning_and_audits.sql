-- Dominus: memória aprovada e auditoria operacional.
-- Estas tabelas não são expostas ao cliente. O acesso passa por Edge Functions
-- que aplicam a sessão e o nível de acesso do colaborador.

create table if not exists public.dominus_learning_reviews (
  id uuid primary key default gen_random_uuid(),
  memory_key text not null default '' check (length(memory_key) <= 200),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'edited', 'expired')),
  proposed_rule text not null check (length(trim(proposed_rule)) between 1 and 2000),
  rationale text not null default '' check (length(rationale) <= 4000),
  scope text not null default 'agency'
    check (scope in ('agency', 'team', 'user', 'group')),
  scope_id text,
  evidence jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence) = 'array'),
  source_refs text[] not null default '{}',
  proposed_at timestamptz not null default now(),
  proposed_by text,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text not null default '' check (length(review_note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope = 'agency' or nullif(trim(scope_id), '') is not null)
);

comment on table public.dominus_learning_reviews is
  'Candidate Dominus rules awaiting explicit human review; no raw chat or media content.';

create index if not exists dominus_learning_reviews_pending_idx
  on public.dominus_learning_reviews (status, proposed_at desc)
  where status = 'pending';

create table if not exists public.dominus_memory (
  id uuid primary key default gen_random_uuid(),
  memory_key text not null,
  rule text not null check (length(trim(rule)) between 1 and 4000),
  scope text not null default 'agency'
    check (scope in ('agency', 'team', 'user', 'group')),
  scope_id text,
  status text not null default 'active'
    check (status in ('active', 'retired')),
  version integer not null default 1 check (version > 0),
  source_review_id uuid references public.dominus_learning_reviews(id) on delete set null,
  approved_at timestamptz not null default now(),
  approved_by text not null,
  retired_at timestamptz,
  retired_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope = 'agency' or nullif(trim(scope_id), '') is not null),
  check ((status = 'active' and retired_at is null) or status = 'retired')
);

comment on table public.dominus_memory is
  'Versioned Dominus rules explicitly approved by an authorized Master.';

create unique index if not exists dominus_memory_active_key_idx
  on public.dominus_memory (memory_key, scope, coalesce(scope_id, ''))
  where status = 'active';

create index if not exists dominus_memory_scope_idx
  on public.dominus_memory (scope, scope_id, status, updated_at desc);

create table if not exists public.dominus_audit_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  period_start timestamptz,
  period_end timestamptz,
  findings_count integer not null default 0 check (findings_count >= 0),
  triggered_by text,
  error_message text not null default '' check (length(error_message) <= 4000),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.dominus_audit_runs is
  'Execution history for deterministic operational/data-quality audits.';

create index if not exists dominus_audit_runs_started_idx
  on public.dominus_audit_runs (started_at desc);

create table if not exists public.dominus_audit_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.dominus_audit_runs(id) on delete cascade,
  category text not null
    check (category in ('empty_briefing', 'job_without_subtasks', 'workflow_inconsistency', 'indicator_inconsistency', 'missing_data', 'orphan_data', 'stale_data', 'bottleneck', 'other')),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'ignored')),
  title text not null check (length(trim(title)) between 1 and 500),
  description text not null default '' check (length(description) <= 4000),
  entity text,
  record_id text,
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  suggested_action text not null default '' check (length(suggested_action) <= 2000),
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dominus_audit_findings is
  'Evidence-backed findings from Dominus operational and data-quality audits.';

create index if not exists dominus_audit_findings_run_idx
  on public.dominus_audit_findings (run_id, severity, status);

create index if not exists dominus_audit_findings_open_idx
  on public.dominus_audit_findings (status, severity, created_at desc)
  where status in ('open', 'acknowledged');

alter table public.dominus_learning_reviews enable row level security;
alter table public.dominus_memory enable row level security;
alter table public.dominus_audit_runs enable row level security;
alter table public.dominus_audit_findings enable row level security;

revoke all on public.dominus_learning_reviews from anon, authenticated;
revoke all on public.dominus_memory from anon, authenticated;
revoke all on public.dominus_audit_runs from anon, authenticated;
revoke all on public.dominus_audit_findings from anon, authenticated;
