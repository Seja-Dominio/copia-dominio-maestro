-- The function is invoked by the database event trigger, not by application RPC.
-- Some fresh branches do not include the dashboard-managed bootstrap helper;
-- keep the migration replayable while still revoking grants wherever it exists.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end $$;
