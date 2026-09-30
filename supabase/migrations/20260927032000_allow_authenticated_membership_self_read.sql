-- As policies de tenant consultam organization_members. Permitir apenas a
-- leitura do próprio vínculo dá visibilidade às policies sem expor diretório
-- de membros nem habilitar escrita do lado cliente.
revoke all on table public.organization_members from public, anon, authenticated;
grant select on public.organization_members to authenticated;

drop policy if exists organization_members_self_read on public.organization_members;
create policy organization_members_self_read
  on public.organization_members
  for select
  to authenticated
  using (collaborator_id = (select auth.uid()::text));
