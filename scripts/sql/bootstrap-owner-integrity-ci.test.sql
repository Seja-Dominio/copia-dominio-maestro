-- Fresh migration replay may have no collaborator seed. It must not leave an
-- active organization that has no active owner or silently scope legacy data.
do $assert_bootstrap_owner$
begin
  if exists (
    select 1
    from public.organizations o
    where o.status = 'active'
      and not exists (
        select 1
        from public.organization_members m
        where m.organization_id = o.id
          and m.role = 'owner'
          and m.status = 'active'
      )
  ) then
    raise exception 'Clean migration replay left an active organization without an owner';
  end if;

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
