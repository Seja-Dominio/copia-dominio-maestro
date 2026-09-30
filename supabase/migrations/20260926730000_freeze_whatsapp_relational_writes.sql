update public.legacy_cutover_registry
set read_mode = 'relational',
    write_mode = 'relational',
    legacy_write_allowed = false,
    status = 'frozen',
    evidence = 'whatsapp-send grava e remove automações, contatos e grupos no relacional; legado bloqueado após paridade e isolamento validados.'
where entity in ('WhatsappAutomation', 'WhatsappContact', 'WhatsappGroup');
