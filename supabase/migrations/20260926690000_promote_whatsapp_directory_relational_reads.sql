update public.legacy_cutover_registry
set read_mode = 'relational',
    status = 'candidate',
    evidence = 'Frontend e worker whatsapp-send usam as tabelas relacionais; gravação permanece dual até concluir a observação operacional.'
where entity in ('WhatsappContact', 'WhatsappGroup');
