-- Oversized numeric strings must fail closed without leaking cast errors or writes.
BEGIN;
SET LOCAL session_replication_role = replica;

INSERT INTO public.organizations (id, name, slug, status)
VALUES ('00000000-0000-0000-0000-00000000c121', 'Projection Invalid CI', 'projection-invalid-ci', 'active');
INSERT INTO public.legacy_records (entity, record_id, organization_id, payload)
VALUES (
  'NpsHistory', 'projection-reconcile-overflow',
  '00000000-0000-0000-0000-00000000c121',
  '{"delta":"999999999999999999999999999999999999999999"}'::jsonb
);

-- LEGACY_PROJECTION_RECONCILE_INVALID_MIGRATION_BARRIER

ROLLBACK;
