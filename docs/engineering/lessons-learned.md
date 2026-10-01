# Lições de engenharia

## RPC `SECURITY INVOKER`: testar o papel executor — 01/10/2026

- **Evidência:** `resolve_job_task_reconciliation` tinha EXECUTE restrito e configuração segura, mas uma chamada sob `service_role` no clone isolado falhou por falta de privilégio nas colunas da tabela usada internamente. O teste estrutural anterior não detectava a falha.
- **Correção validada:** grants mínimos por coluna, leitura explícita apenas das colunas necessárias e lock transacional por item; regressão rollback-only passou para sucesso, isolamento cross-tenant, replay da resolução, privilégios mínimos e atomicidade.
- **Aplicação:** RPCs PostgreSQL `SECURITY INVOKER` em migrations de qualquer módulo; validar com o papel real e testar permissões efetivas além do catálogo da função.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, acrescentando chamada real como papel invoker e teste transacional tenant-aware. Mudança pequena e acionável, sustentada por defeito funcional reproduzido e correção validada.
