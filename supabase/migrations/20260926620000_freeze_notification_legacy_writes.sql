update public.legacy_cutover_registry
set status = 'frozen',
    write_mode = 'relational',
    legacy_write_allowed = false,
    evidence = 'Corte aplicado após escrita relacional direta em create, update, bulkCreate e delete; paridade 0.',
    updated_at = now(),
    updated_by = 'cutover-notification'
where entity = 'Notification';
