-- Synthetic, transaction-only tenant contract for the internal team chat.
-- Uses a migrated clean-room baseline and reverts every fixture.
BEGIN;

DO $$
DECLARE
  organization_a uuid;
  organization_b uuid;
  channel_a uuid;
  channel_b uuid;
  message_a uuid;
  collaborator_a text := 'team-chat-ci-a-' || gen_random_uuid()::text;
  collaborator_b text := 'team-chat-ci-b-' || gen_random_uuid()::text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_chat_channels'
      AND column_name = 'organization_id'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_chat_messages'
      AND column_name = 'organization_id'
      AND is_nullable = 'NO'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_chat_message_reactions'
      AND column_name = 'organization_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'Team chat is missing required tenant columns.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'team_chat_channels' AND rowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'team_chat_messages' AND rowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'team_chat_message_reactions' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS must remain enabled for all team-chat tables.';
  END IF;

  IF has_table_privilege('anon', 'public.team_chat_channels', 'SELECT')
    OR has_table_privilege('authenticated', 'public.team_chat_channels', 'SELECT')
    OR has_table_privilege('anon', 'public.team_chat_messages', 'SELECT')
    OR has_table_privilege('authenticated', 'public.team_chat_messages', 'SELECT')
    OR has_table_privilege('anon', 'public.team_chat_message_reactions', 'SELECT')
    OR has_table_privilege('authenticated', 'public.team_chat_message_reactions', 'SELECT') THEN
    RAISE EXCEPTION 'Client roles must not read server-managed team-chat tables directly.';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.team_chat_channels', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.team_chat_messages', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.team_chat_messages', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.team_chat_message_reactions', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.team_chat_message_reactions', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.team_chat_message_reactions', 'DELETE') THEN
    RAISE EXCEPTION 'The team-chat Edge Function is missing a required service-role grant.';
  END IF;

  SELECT organization_id INTO organization_a
  FROM public.team_chat_channels
  ORDER BY created_at, id
  LIMIT 1;
  IF organization_a IS NULL THEN
    RAISE EXCEPTION 'Clean-room migration replay must seed a tenant-scoped team-chat channel.';
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES ('Team chat CI tenant B', 'team-chat-ci-' || gen_random_uuid()::text)
  RETURNING id INTO organization_b;

  INSERT INTO public.maestro_collaborators (id, login, profile)
  VALUES
    (collaborator_a, collaborator_a, '{"name":"Team Chat CI A"}'::jsonb),
    (collaborator_b, collaborator_b, '{"name":"Team Chat CI B"}'::jsonb);

  INSERT INTO public.organization_members (organization_id, collaborator_id, role, status)
  VALUES
    (organization_a, collaborator_a, 'member', 'active'),
    (organization_b, collaborator_b, 'member', 'active');

  INSERT INTO public.team_chat_channels (organization_id, slug, name)
  SELECT organization_b, slug, name || ' B'
  FROM public.team_chat_channels
  WHERE organization_id = organization_a
  ORDER BY created_at, id
  LIMIT 1
  RETURNING id INTO channel_b;

  SELECT id INTO channel_a
  FROM public.team_chat_channels
  WHERE organization_id = organization_a
  ORDER BY created_at, id
  LIMIT 1;

  IF channel_a IS NULL OR channel_b IS NULL THEN
    RAISE EXCEPTION 'Could not create same-slug channels in separate tenants.';
  END IF;

  INSERT INTO public.team_chat_messages (organization_id, channel_id, author_id, content)
  VALUES (organization_a, channel_a, collaborator_a, 'Same-tenant message A')
  RETURNING id INTO message_a;

  INSERT INTO public.team_chat_messages (organization_id, channel_id, author_id, content)
  VALUES (organization_b, channel_b, collaborator_b, 'Same-tenant message B');

  INSERT INTO public.team_chat_message_reactions (organization_id, message_id, collaborator_id, emoji)
  VALUES (organization_a, message_a, collaborator_a, '👍');

  BEGIN
    INSERT INTO public.team_chat_messages (organization_id, channel_id, author_id, content)
    VALUES (organization_b, channel_a, collaborator_b, 'Cross-tenant channel reference');
    RAISE EXCEPTION 'Cross-tenant channel reference unexpectedly succeeded.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.team_chat_messages (organization_id, channel_id, author_id, content, reply_to_id)
    VALUES (organization_b, channel_b, collaborator_b, 'Cross-tenant reply', message_a);
    RAISE EXCEPTION 'Cross-tenant reply unexpectedly succeeded.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.team_chat_message_reactions (organization_id, message_id, collaborator_id, emoji)
    VALUES (organization_b, message_a, collaborator_b, '🔥');
    RAISE EXCEPTION 'Cross-tenant reaction unexpectedly succeeded.';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS: tenant columns, RLS/grants, same-tenant chat operations, and cross-tenant rejection.';
END;
$$;

ROLLBACK;
