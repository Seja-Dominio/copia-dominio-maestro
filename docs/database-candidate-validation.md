# Database candidate validation

## 2026-09-30 — hosted Dev preview

- Git candidate: `codex/maestro-db-canonical-candidate` (migration-only base commit `d9e1c7cac7e9524ee6ea79eb75dfdb2f69d038ad`).
- Supabase preview: `maestro-db-canonical-candidate-20260930` (`fwvpfmbkuosjibvyvbap`), cloned from Dev with `with_data=false`.
- Supabase CLI applied the 169 pending migrations to this isolated preview using `db push --skip-vault`; no vault/config secrets were changed.
- A subsequent transaction-read-only ledger audit confirmed 172/172 versions and SQL statement sequences exactly match the candidate; zero local or remote unmatched migrations. Core tenant/product tables are present.
- Hosted checks passed: tenant foundation (24 contracts, 13 tenant FKs), tenant isolation, product-module/RLS boundary (Maestro, CXM, Ads Brain, Insights; 16 authenticated policies), and CXM silence-queue tenant isolation. Fixture-based checks rolled back.
- Limitation: Supabase Branching still reports `MIGRATIONS_FAILED` from its initial workflow, despite the successful CLI push and matching hosted ledger. This preview proves database migration replay and selected contracts, not Edge Function deployment, authenticated app end-to-end flows, full Supabase backup/restore, or CXM standalone hosting. Do not promote or merge to the Dev/Production parent on this evidence alone.
