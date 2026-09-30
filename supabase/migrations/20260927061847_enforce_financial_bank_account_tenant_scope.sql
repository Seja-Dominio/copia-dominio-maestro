-- Garante que uma conta usada em um lançamento pertença à mesma organização.
-- Ao excluir uma dimensão, limpa apenas a referência, preservando o snapshot
-- textual e o payload legado do lançamento para histórico e compatibilidade.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.maestro_financial_entries'::regclass
      and conname = 'maestro_financial_entries_org_bank_account_fk'
  ) then
    alter table public.maestro_financial_entries
      add constraint maestro_financial_entries_org_bank_account_fk
      foreign key (organization_id, bank_account_legacy_record_id)
      references public.maestro_bank_accounts (organization_id, legacy_record_id)
      on delete set null (bank_account_legacy_record_id)
      not valid;
  end if;
end
$$;

alter table public.maestro_financial_entries
  validate constraint maestro_financial_entries_org_bank_account_fk;
