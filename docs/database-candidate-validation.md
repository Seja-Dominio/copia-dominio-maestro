# Database candidate validation

## 2026-09-30 — hosted Dev preview

- Git candidate: `codex/maestro-db-canonical-candidate` (migration-only base commit `d9e1c7cac7e9524ee6ea79eb75dfdb2f69d038ad`).
- Supabase preview: `maestro-db-canonical-candidate-20260930` (`fwvpfmbkuosjibvyvbap`), cloned from Dev with `with_data=false`.
- Supabase CLI applied the 169 pending migrations to this isolated preview using `db push --skip-vault`; no vault/config secrets were changed.
- A subsequent transaction-read-only ledger audit confirmed 172/172 versions and SQL statement sequences exactly match the candidate; zero local or remote unmatched migrations. Core tenant/product tables are present.
- Hosted checks passed: tenant foundation (24 contracts, 13 tenant FKs), tenant isolation, product-module/RLS boundary (Maestro, CXM, Ads Brain, Insights; 16 authenticated policies), and CXM silence-queue tenant isolation. Fixture-based checks rolled back.
- Limitation: Supabase Branching still reports `MIGRATIONS_FAILED` from its initial workflow, despite the successful CLI push and matching hosted ledger. This preview proves database migration replay and selected contracts, not Edge Function deployment, authenticated app end-to-end flows, full Supabase backup/restore, or CXM standalone hosting. Do not promote or merge to the Dev/Production parent on this evidence alone.

## 2026-09-30 — hosted rollback-only migration tests

- The candidate preview (`fwvpfmbkuosjibvyvbap`) remains a no-data child of Dev with 172 ledger entries through `20260930160000`; `maestro_timesheets` exists. Its branching status remains `MIGRATIONS_FAILED`, so tests here are evidence about the reachable database/schema, not a claim that Supabase Branching's migration workflow is healthy.
- Replayed the current `20260930140000_repair_timesheet_payload_projection.sql` against four synthetic timesheets in one transaction, then repeated it. Assertions passed for valid conversions, overflow/invalid timestamps, partial validity, preserving existing values, and second-run idempotence. A follow-up `READ ONLY` query confirmed `transaction_read_only=on` and zero fixture rows.
- In a separate transaction, applied `20260930170000_reject_cross_tenant_core_projection_references.sql` and ran the full SQL tenant-isolation suite. It passed against the hosted preview, including negative cross-tenant references. Follow-up read-only checks found zero fixture rows and confirmed the cross-tenant guard did not persist after rollback.
- Neither test used production data or changed the preview's durable schema/ledger. This strengthens migration behavior evidence but does not make the preview a production-shaped data clone, reconcile all migration drift, or authorize any remote cutover.
