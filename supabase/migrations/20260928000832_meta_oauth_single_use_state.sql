create table if not exists public.maestro_meta_oauth_states (
  nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  collaborator_id text not null references public.maestro_collaborators(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists maestro_meta_oauth_states_expires_at_idx
  on public.maestro_meta_oauth_states (expires_at);

alter table public.maestro_meta_oauth_states enable row level security;
revoke all on public.maestro_meta_oauth_states from public, anon, authenticated;
grant select, insert, delete on public.maestro_meta_oauth_states to service_role;
