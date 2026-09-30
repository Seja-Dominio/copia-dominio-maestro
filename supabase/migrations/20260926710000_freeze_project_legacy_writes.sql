update public.legacy_cutover_registry
set read_mode = 'relational',
    write_mode = 'relational',
    legacy_write_allowed = false,
    status = 'frozen',
    evidence = 'maestro-data usa escrita, calendário e exclusão relacionais quando congelado; paridade e isolamento validados.'
where entity = 'Project';
