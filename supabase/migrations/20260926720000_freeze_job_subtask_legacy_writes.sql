update public.legacy_cutover_registry
set read_mode = 'relational',
    write_mode = 'relational',
    legacy_write_allowed = false,
    status = 'frozen',
    evidence = 'maestro-data grava diretamente no relacional e registra histórico operacional em maestro_job_history; paridade e isolamento validados.'
where entity in ('Job', 'Subtask');
