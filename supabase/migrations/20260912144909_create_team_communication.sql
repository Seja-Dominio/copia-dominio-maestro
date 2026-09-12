-- Comunicação interna da equipe.
-- O acesso operacional passa pela Edge Function team-chat, que valida a
-- sessão HMAC legada antes de consultar estas tabelas com service role.

create table if not exists public.team_chat_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  is_private boolean not null default false,
  is_archived boolean not null default false,
  created_by text references public.maestro_collaborators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.team_chat_channels(id) on delete cascade,
  author_id text not null references public.maestro_collaborators(id) on delete restrict,
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  reply_to_id uuid references public.team_chat_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists team_chat_messages_channel_created_idx
  on public.team_chat_messages (channel_id, created_at);

create table if not exists public.team_chat_message_reactions (
  message_id uuid not null references public.team_chat_messages(id) on delete cascade,
  collaborator_id text not null references public.maestro_collaborators(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, collaborator_id, emoji)
);

create index if not exists team_chat_reactions_message_idx
  on public.team_chat_message_reactions (message_id);

alter table public.team_chat_channels enable row level security;
alter table public.team_chat_messages enable row level security;
alter table public.team_chat_message_reactions enable row level security;

-- Nenhuma destas tabelas fica disponível para leitura direta pelo cliente.
-- A Edge Function aplica a autorização por colaborador ativo e centraliza a
-- futura regra de canais privados, menções e notificações.

insert into public.team_chat_channels (slug, name, description)
values
  ('geral', 'Geral', 'Avisos e conversas de toda a equipe'),
  ('operacao', 'Operação', 'Projetos, jobs, prazos e bloqueios'),
  ('comercial', 'Comercial', 'Leads, oportunidades e alinhamentos comerciais')
on conflict (slug) do nothing;
