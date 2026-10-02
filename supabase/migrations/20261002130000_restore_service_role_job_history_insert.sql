-- The legacy JobHistory projection runs as its invoker and uses
-- ON CONFLICT DO NOTHING, which also requires SELECT on the target relation.
-- Reassert only the server-side privileges observed in the Dev contract.
grant select, insert on table public.maestro_job_history to service_role;
