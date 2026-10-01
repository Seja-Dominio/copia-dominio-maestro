-- Fresh schema replay has no collaborator seed. Tenant bootstrap must not
-- silently assign legacy data to an organization without an active owner.
do $assert_bootstrap_owner$
begin
  if exists (
    select 1
    from public.organization_legacy_records s
    where not exists (
      select 1
      from public.organization_members m
      where m.organization_id = s.organization_id
        and m.role = 'owner'
        and m.status = 'active'
    )
  ) then
    raise exception 'Clean migration replay scoped legacy data without an active owner';
  end if;
end;
$assert_bootstrap_owner$;
