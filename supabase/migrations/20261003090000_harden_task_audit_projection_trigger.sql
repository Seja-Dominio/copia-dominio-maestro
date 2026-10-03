-- The compatibility trigger maintains the relational audit projection on
-- behalf of server-side writers. Run its narrowly scoped work as the function
-- owner so SECURITY INVOKER RPCs do not need direct write access to the audit
-- table.
alter function public.maestro_sync_task_audit_log() security definer;
alter function public.maestro_sync_task_audit_log() set search_path = '';

revoke all on function public.maestro_sync_task_audit_log()
  from public, anon, authenticated, service_role;
