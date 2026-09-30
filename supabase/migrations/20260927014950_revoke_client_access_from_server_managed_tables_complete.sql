-- These tables are accessed through server-side Edge Functions using
-- service_role. Browser clients must not receive table privileges, especially
-- while these tables intentionally have no client-facing RLS policies.
-- Existing grants on five tables are revoked by the earlier migration; this
-- completes coverage for the remaining tables found in the production audit.
-- service_role and postgres privileges are intentionally preserved.
revoke all privileges on table
  public.job_task_reconciliation,
  public.maestro_ai_query_logs,
  public.organization_integrations,
  public.organization_legacy_records,
  public.organization_members,
  public.organization_products,
  public.organizations,
  public.relational_integrity_exceptions
from public, anon, authenticated;
