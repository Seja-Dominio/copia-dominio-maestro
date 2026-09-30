update public.legacy_cutover_registry
set status = 'frozen',
    write_mode = 'relational',
    legacy_write_allowed = false,
    evidence = 'Corte aplicado após leitura relacional, escrita relacional direta em create/update/bulkCreate/delete e paridade 0.',
    updated_at = now(),
    updated_by = 'cutover-insights-nps'
where entity in ('NpsEntry', 'NpsHistory');
