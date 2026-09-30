update public.legacy_cutover_registry
set write_mode = 'relational', updated_at = now(), updated_by = 'cutover-financial-dimensions'
where entity in ('BankAccount', 'FinancialCategory', 'CostCenter') and status = 'frozen';
