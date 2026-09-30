create index if not exists team_chat_channels_org_creator_idx
  on public.team_chat_channels (organization_id, created_by)
  where created_by is not null;
create index if not exists team_chat_messages_org_author_idx
  on public.team_chat_messages (organization_id, author_id);
create index if not exists team_chat_reactions_org_collaborator_idx
  on public.team_chat_message_reactions (organization_id, collaborator_id);

alter table public.team_chat_channels
  drop constraint if exists team_chat_channels_created_by_fkey;
alter table public.team_chat_channels
  add constraint team_chat_channels_creator_tenant_fk
  foreign key (organization_id, created_by)
  references public.organization_members (organization_id, collaborator_id)
  on delete set null (created_by);

alter table public.team_chat_messages
  drop constraint if exists team_chat_messages_author_id_fkey;
alter table public.team_chat_messages
  add constraint team_chat_messages_author_tenant_fk
  foreign key (organization_id, author_id)
  references public.organization_members (organization_id, collaborator_id);

alter table public.team_chat_message_reactions
  drop constraint if exists team_chat_message_reactions_collaborator_id_fkey;
alter table public.team_chat_message_reactions
  add constraint team_chat_reactions_collaborator_tenant_fk
  foreign key (organization_id, collaborator_id)
  references public.organization_members (organization_id, collaborator_id)
  on delete cascade;
