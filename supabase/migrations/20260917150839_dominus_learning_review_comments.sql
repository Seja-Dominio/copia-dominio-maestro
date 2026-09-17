-- Conversation and immutable action history for the Dominus review panel.
-- Raw WhatsApp messages and media are intentionally not stored here.

create table if not exists public.dominus_learning_review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.dominus_learning_reviews(id) on delete cascade,
  author_id text not null,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.dominus_learning_review_comments is
  'Master-only discussion notes attached to a Dominus learning review; no raw chat or media content.';

create index if not exists dominus_learning_review_comments_review_idx
  on public.dominus_learning_review_comments (review_id, created_at asc);

create table if not exists public.dominus_learning_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.dominus_learning_reviews(id) on delete cascade,
  event_type text not null
    check (event_type in ('created', 'edited', 'approved', 'rejected')),
  actor_id text not null,
  note text not null default '' check (length(note) <= 4000),
  snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.dominus_learning_review_events is
  'Immutable audit trail for Dominus learning review decisions and edits.';

create index if not exists dominus_learning_review_events_review_idx
  on public.dominus_learning_review_events (review_id, created_at desc);

alter table public.dominus_learning_review_comments enable row level security;
alter table public.dominus_learning_review_events enable row level security;

revoke all on public.dominus_learning_review_comments from anon, authenticated;
revoke all on public.dominus_learning_review_events from anon, authenticated;
