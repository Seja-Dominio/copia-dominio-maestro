-- The legacy JobHistory projection runs as its invoker. Reassert the narrowly
-- scoped server-side INSERT privilege after the tenant-aware trigger changes.
grant insert on table public.maestro_job_history to service_role;
