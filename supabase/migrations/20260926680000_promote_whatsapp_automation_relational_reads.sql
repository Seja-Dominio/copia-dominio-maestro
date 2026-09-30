update public.legacy_cutover_registry
set read_mode = 'relational',
    status = 'candidate',
    evidence = 'Frontend, worker whatsapp-send e dominus-webhook usam a tabela relacional; gravação permanece dual até validar todos os fluxos de edição.'
where entity = 'WhatsappAutomation';
