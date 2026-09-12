create index if not exists team_chat_channels_created_by_idx
  on public.team_chat_channels (created_by);

create index if not exists team_chat_messages_author_idx
  on public.team_chat_messages (author_id);

create index if not exists team_chat_messages_reply_to_idx
  on public.team_chat_messages (reply_to_id);

create index if not exists team_chat_reactions_collaborator_idx
  on public.team_chat_message_reactions (collaborator_id);
