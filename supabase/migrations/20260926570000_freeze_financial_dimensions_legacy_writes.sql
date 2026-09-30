-- Primeiro corte controlado: dimensões financeiras já possuem leitura relacional,
-- escrita relacional prioritária e paridade validada.
update public.legacy_cutover_registry
set status = 'frozen',
    legacy_write_allowed = false,
    evidence = 'Corte aplicado após paridade 0, leitura relacional ativa, RLS validado e dual-write estável.',
    updated_at = now(),
    updated_by = 'cutover-financial-dimensions'
where entity in ('BankAccount', 'FinancialCategory', 'CostCenter');
