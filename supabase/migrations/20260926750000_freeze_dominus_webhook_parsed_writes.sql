update public.legacy_cutover_registry
set read_mode = 'relational',
    write_mode = 'relational',
    legacy_write_allowed = false,
    status = 'frozen',
    evidence = 'dominus-webhook grava diretamente no relacional; registro legado bloqueado após paridade validada.'
where entity = 'DominusWebhookParsed';
