# `maestro-core-data` runtime snapshots

These are read-only source snapshots downloaded from the currently deployed Supabase projects on 2026-10-01. They are preserved for audit and reconciliation; they are **not** the deployable function tree and must not be deployed from these nested paths.

- `production/supabase/functions/`: production project `fwpisypiiezjhtqxlmqv`, reported deployed version 2.
- `development/supabase/functions/`: development project `tqmfuskvllpqmvayjuqu`, reported deployed version 7.

The snapshots include the function and the shared modules packaged by the Supabase CLI. Their differences include the collaborator Job-patch assignment check documented in `docs/migration-drift-reconciliation.md`. Neither snapshot is declared canonical. Reconcile behavior, consumers, tenant authorization, error handling, and tests before promoting source into `supabase/functions/maestro-core-data` or changing any deployment.

Do not commit Supabase CLI `.temp` metadata or project credentials from the download workdirs.
