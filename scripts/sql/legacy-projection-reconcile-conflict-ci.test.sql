-- The migration must reject contradictory tenant evidence before writes.
BEGIN;
SET LOCAL session_replication_role = replica;

INSERT INTO public.organizations (id, name, slug, status) VALUES
  ('00000000-0000-0000-0000-00000000c111', 'Projection Conflict CI A', 'projection-conflict-ci-a', 'active'),
  ('00000000-0000-0000-0000-00000000c112', 'Projection Conflict CI B', 'projection-conflict-ci-b', 'active');
INSERT INTO public.legacy_records (entity, record_id, organization_id, payload)
VALUES ('Notification', 'projection-reconcile-conflict', '00000000-0000-0000-0000-00000000c111', '{"title":"conflict"}'::jsonb);
INSERT INTO public.organization_legacy_records (
  organization_id, legacy_entity, legacy_record_id, scope_status, source
) VALUES (
  '00000000-0000-0000-0000-00000000c112', 'Notification', 'projection-reconcile-conflict', 'confirmed', 'conflict-fixture'
);

-- LEGACY_PROJECTION_RECONCILE_CONFLICT_MIGRATION_BARRIER

ROLLBACK;
