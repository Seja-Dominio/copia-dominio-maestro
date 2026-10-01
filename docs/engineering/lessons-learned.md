# Lições de engenharia

## Migrations multi-relação: classificar alvos antes do pacote — 30/09/2026

- **Evidência:** a migration `20260926520000_add_authenticated_organization_rls` mistura 33 tabelas; Produção tem 33 e 132 policies, Dev tem 9 e nenhuma policy, e 12 tabelas não aparecem no registry de ownership. O alvo SQL não faz guarda de existência. A classificação por catálogo + mapa funcional confirmou produtos misturados e cinco domínios Maestro sustentados, três tabelas Dominus sem owner de produto e quatro alvos ainda indeterminados.
- **Resultado validado:** o replay integral da branch limpa passou no CI `36808101999`; isso não resolve os ledgers/objetos divergentes nos ambientes remotos. A regra de não mascarar baseline incompatível evita declarar reconciliação com base em guards que apenas pulam objetos ausentes.
- **Aplicação:** migrations multi-tabela, RLS e pacotes por produto; inventariar alvos, owner, presença por ambiente e dependências antes de particionar ou testar upgrade.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, com esse cruzamento obrigatório e a ressalva contra guards silenciosos. Esforço ativo: não medido.

## RPC `SECURITY INVOKER`: testar o papel executor — 01/10/2026

- **Evidência:** `resolve_job_task_reconciliation` tinha EXECUTE restrito e configuração segura, mas uma chamada sob `service_role` no clone isolado falhou por falta de privilégio nas colunas da tabela usada internamente. O teste estrutural anterior não detectava a falha.
- **Correção validada:** grants mínimos por coluna, leitura explícita apenas das colunas necessárias e lock transacional por item; regressão rollback-only passou para sucesso, isolamento cross-tenant, replay da resolução, privilégios mínimos e atomicidade.
- **Aplicação:** RPCs PostgreSQL `SECURITY INVOKER` em migrations de qualquer módulo; validar com o papel real e testar permissões efetivas além do catálogo da função.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, acrescentando chamada real como papel invoker e teste transacional tenant-aware. Mudança pequena e acionável, sustentada por defeito funcional reproduzido e correção validada.
