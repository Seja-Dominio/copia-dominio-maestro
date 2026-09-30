-- These tables are accessed through server-side Edge Functions using
-- service_role, not directly by browser clients. Keep RLS enabled with no
-- policies and remove the current client-role table grants as defense in depth.
-- service_role and postgres privileges are intentionally preserved.
do $$
begin
  -- `public.collaborators` exists only in some historical imports; avoid
  -- making clean branches depend on that optional compatibility table.
  if to_regclass('public.collaborators') is not null then
    execute 'revoke all privileges on table public.collaborators from anon, authenticated';
  end if;
  execute 'revoke all privileges on table public.maestro_collaborators, public.team_chat_channels, public.team_chat_messages, public.team_chat_message_reactions from anon, authenticated';
end $$;

-- Rollback, only if a reviewed direct-client access model is introduced:
-- grant all privileges on table
--   public.collaborators,
--   public.maestro_collaborators,
--   public.team_chat_channels,
--   public.team_chat_messages,
--   public.team_chat_message_reactions
-- to anon, authenticated;
