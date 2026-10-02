-- Synthetic source-scoped rows for the forward reconciliation migration.
-- Every row is transaction-only; triggers are suppressed so the fixture models
-- the hosted Dev gap (legacy tenant present, mapping/projection absent).
BEGIN;
SET LOCAL session_replication_role = replica;

INSERT INTO public.organizations (id, name, slug, status) VALUES
  ('00000000-0000-0000-0000-00000000c101', 'Projection Reconcile CI A', 'projection-reconcile-ci-a', 'active'),
  ('00000000-0000-0000-0000-00000000c102', 'Projection Reconcile CI B', 'projection-reconcile-ci-b', 'active');

INSERT INTO public.legacy_records (entity, record_id, organization_id, payload) VALUES
  ('Notification', 'projection-reconcile-notification-a', '00000000-0000-0000-0000-00000000c101', '{"title":"A","is_read":false}'::jsonb),
  ('Notification', 'projection-reconcile-notification-b', '00000000-0000-0000-0000-00000000c102', '{"title":"B","is_read":true}'::jsonb),
  ('NpsHistory', 'projection-reconcile-nps-history', '00000000-0000-0000-0000-00000000c101', '{"delta":5,"score_before":40,"score_after":45,"month":"2026-10"}'::jsonb),
  ('DominusAuditSummary', 'projection-reconcile-audit-summary', '00000000-0000-0000-0000-00000000c102', '{"summary":"fixture"}'::jsonb);

-- LEGACY_PROJECTION_RECONCILE_MIGRATION_BARRIER

DO $$
BEGIN
  IF (SELECT count(*) FROM public.organization_legacy_records
      WHERE legacy_record_id LIKE 'projection-reconcile-%'
        AND source = 'source-organization-reconciliation') <> 4 THEN
    RAISE EXCEPTION 'Reconciliation did not create exactly four confirmed source mappings';
  END IF;
  IF (SELECT count(*) FROM public.maestro_notifications
      WHERE legacy_record_id LIKE 'projection-reconcile-notification-%') <> 2
    OR EXISTS (
      SELECT 1 FROM public.maestro_notifications p
      JOIN public.legacy_records l ON l.entity = 'Notification' AND l.record_id = p.legacy_record_id
      WHERE p.legacy_record_id LIKE 'projection-reconcile-notification-%'
        AND p.organization_id <> l.organization_id
    ) THEN
    RAISE EXCEPTION 'Notification projection is missing or has the wrong tenant';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.maestro_nps_history
    WHERE legacy_record_id = 'projection-reconcile-nps-history'
      AND organization_id = '00000000-0000-0000-0000-00000000c101'
      AND delta = 5 AND score_before = 40 AND score_after = 45
  ) THEN
    RAISE EXCEPTION 'NPS history projection or tenant is incorrect';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.maestro_audit_summaries
    WHERE legacy_record_id = 'projection-reconcile-audit-summary'
      AND organization_id = '00000000-0000-0000-0000-00000000c102'
      AND summary = 'fixture'
  ) THEN
    RAISE EXCEPTION 'Audit summary projection or tenant is incorrect';
  END IF;
END;
$$;

-- LEGACY_PROJECTION_RECONCILE_IDEMPOTENCE_BARRIER

DO $$
BEGIN
  IF (SELECT count(*) FROM public.organization_legacy_records
      WHERE legacy_record_id LIKE 'projection-reconcile-%') <> 4
    OR (SELECT count(*) FROM public.maestro_notifications
      WHERE legacy_record_id LIKE 'projection-reconcile-notification-%') <> 2
    OR (SELECT count(*) FROM public.maestro_nps_history
      WHERE legacy_record_id = 'projection-reconcile-nps-history') <> 1
    OR (SELECT count(*) FROM public.maestro_audit_summaries
      WHERE legacy_record_id = 'projection-reconcile-audit-summary') <> 1 THEN
    RAISE EXCEPTION 'Re-running the reconciliation migration was not idempotent';
  END IF;
END;
$$;

ROLLBACK;
