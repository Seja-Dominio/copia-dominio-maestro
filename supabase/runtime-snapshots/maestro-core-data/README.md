# `maestro-core-data` runtime snapshots

These are read-only source snapshots downloaded on 2026-10-01. They are preserved for audit and reconciliation; they are **not** the deployable function tree and must not be deployed from these nested paths. The project-ref-to-environment mapping recorded below is now under review because the Supabase Dashboard labels `tqmfuskvllpqmvayjuqu` as `main PRODUCTION`.

- `production/supabase/functions/`: previously attributed to `fwpisypiiezjhtqxlmqv`, reported deployed version 2.
- `development/supabase/functions/`: previously attributed to `tqmfuskvllpqmvayjuqu`, reported deployed version 7; that ref is currently labeled `main PRODUCTION` in the Dashboard.

Do not treat these directory labels as verified environment boundaries until the refs are reconciled. No new remote snapshot/deploy should use either mapping without confirmation.

The snapshots include the function and the shared modules packaged by the Supabase CLI. Their differences include the collaborator Job-patch assignment check documented in `docs/migration-drift-reconciliation.md`. Neither snapshot is declared canonical. Reconcile behavior, consumers, tenant authorization, error handling, and tests before promoting source into `supabase/functions/maestro-core-data` or changing any deployment.

Do not commit Supabase CLI `.temp` metadata or project credentials from the download workdirs.
