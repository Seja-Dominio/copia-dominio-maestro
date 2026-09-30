update public.legacy_cutover_registry
set read_mode = 'relational',
    write_mode = 'relational',
    legacy_write_allowed = false,
    status = 'frozen',
    evidence = 'maestro-data usa gravação e exclusão relacionais quando o registro está congelado; paridade e isolamento validados.'
where entity = 'AgendaEvent';
