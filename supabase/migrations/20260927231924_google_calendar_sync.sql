-- One Google Calendar connection per Maestro organization, with OAuth secrets
-- available only to trusted Edge Functions.
create table if not exists public.maestro_google_calendar_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  calendar_id text not null default 'primary',
  calendar_name text,
  google_account_email text,
  refresh_token_encrypted text,
  connected_by text references public.maestro_collaborators(id) on delete set null,
  connected_at timestamptz,
  sync_token text,
  last_synced_at timestamptz,
  last_sync_error text,
  oauth_state_hash text,
  oauth_state_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maestro_google_calendar_refresh_token_required
    check (connected_at is null or refresh_token_encrypted is not null)
);

create table if not exists public.maestro_google_calendar_event_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_id text not null,
  maestro_event_id text not null,
  google_event_id text not null,
  google_etag text,
  google_updated_at timestamptz,
  maestro_updated_at timestamptz,
  maestro_snapshot jsonb not null default '{}'::jsonb,
  google_snapshot jsonb not null default '{}'::jsonb,
  google_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, calendar_id, maestro_event_id),
  unique (organization_id, calendar_id, google_event_id)
);

create index if not exists maestro_google_calendar_links_google_idx
  on public.maestro_google_calendar_event_links (organization_id, calendar_id, google_event_id);

-- Calendar selection and sync cursors are independent per Google calendar.
create table if not exists public.maestro_google_calendar_calendars (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calendar_id text not null,
  calendar_name text not null,
  access_role text not null,
  is_selected boolean not null default false,
  is_default boolean not null default false,
  sync_token text,
  last_synced_at timestamptz,
  last_sync_error text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, calendar_id),
  constraint maestro_google_calendar_default_must_be_selected
    check (not is_default or is_selected)
);

create unique index if not exists maestro_google_calendar_one_default_idx
  on public.maestro_google_calendar_calendars (organization_id)
  where is_default;

alter table public.maestro_google_calendar_connections enable row level security;
alter table public.maestro_google_calendar_event_links enable row level security;
alter table public.maestro_google_calendar_calendars enable row level security;

revoke all on public.maestro_google_calendar_connections from anon, authenticated;
revoke all on public.maestro_google_calendar_event_links from anon, authenticated;
revoke all on public.maestro_google_calendar_calendars from anon, authenticated;
grant select, insert, update, delete on public.maestro_google_calendar_connections to service_role;
grant select, insert, update, delete on public.maestro_google_calendar_event_links to service_role;
grant select, insert, update, delete on public.maestro_google_calendar_calendars to service_role;
