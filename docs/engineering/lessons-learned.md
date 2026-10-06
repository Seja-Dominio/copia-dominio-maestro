# Lições de engenharia

## 2026-10-05 — Fixtures relacionais respeitam CHECK constraints

- **Contexto:** upgrade local isolado com fixture sanitizada de alta cobertura baseada no checkpoint de Jobs/agenda.
- **Evidência:** duas cargas de teste foram rejeitadas por `organization_members_role_check` (`master`) e `maestro_job_tasks_resolution_status_check` (`unresolved`). A leitura de `pg_get_constraintdef` identificou os valores aceitos; após trocar para `owner` e `pending`, a carga e as 24 migrations posteriores passaram.
- **Causa confirmada:** valores plausíveis foram presumidos em vez de derivados do catálogo do schema.
- **Regra operacional:** antes de gerar dados em colunas com enum/check, consulte as constraints efetivas e selecione um valor permitido; mantenha o seed transacional e confirme ausência de resíduos após falha.
- **Impacto/recuperação:** falhas ocorreram somente no clone local isolado; a primeira transação foi revertida. Nenhum dado hospedado foi alterado.
- **Skill atualizada:** `dominio-database-migrations`, com regra para conferir catálogo, validar opções e reverter fixtures inválidas.
- **Esforço:** não medido.

## 2026-10-05 — Não inferir scheduler efetivo só pelo SQL histórico

- **Contexto:** reconciliação do scheduler de automações WhatsApp entre ledger Dev, migration local/candidata e configuração ativa.
- **Evidência:** a migration remota `20260910100000_enable_whatsapp_automation_scheduler` contém URL fixa do endpoint de Produção; a inspeção read-only de `cron.job` no Dev confirmou job ativo `whatsapp_automation_runner` com destino Dev. A candidata substitui a URL fixa por `whatsapp_automation_project_url` do Vault e não agenda se URL/segredo estiverem ausentes. O estado ativo e o replay histórico, portanto, não são equivalentes.
- **Lição/regra candidata:** em reconciliação de scheduler, registrar separadamente (1) SQL versionado, (2) ledger e (3) comando efetivo ativo; testar replay limpo sem permitir que cron/net disparem chamadas externas. Tratar URL hardcoded de outro ambiente como bloqueio de replay, mesmo quando o job atual já aponta ao ambiente certo.
- **Validações/impacto:** download de migration e função sem publicação; consulta somente leitura ao catálogo Dev; nenhuma alteração de cron, segredo, banco ou Produção. Esforço ativo não medido.
- **Skill:** `dominio-database-migrations` já cobre scheduler, configuração por ambiente e validação do estado efetivo; nenhuma edição adicional para evitar duplicação.

## 2026-10-05 — Diretórios temporários de ensaios de release

- **Contexto:** ensaio local de build e rollback do frontend do Maestro.
- **Evidência:** uma extração inicial para `/tmp` colocou arquivos versionados em um destino compartilhado; uma tentativa subsequente também criou uma symlink no diretório de trabalho. A symlink conhecida foi removida. Não foi possível determinar se arquivos preexistentes de `/tmp` foram substituídos nem recuperar seu conteúdo anterior.
- **Causa confirmada:** o destino não foi criado e validado como diretório exclusivo antes de extrair o arquivo do Git; na primeira execução da simulação, a raiz do laboratório também não foi passada explicitamente ao processo.
- **Regra operacional:** antes de extrair/buildar, criar uma pasta exclusiva com `mktemp -d`, imprimir e validar seu caminho, passar esse caminho explicitamente ao processo e confirmar o diretório de trabalho. Manter symlinks de troca dentro dessa pasta. Nunca extrair arquivos versionados diretamente em `/tmp`, no checkout ou em diretório compartilhado.
- **Impacto/recuperação:** não houve mudança no Git rastreado, VPS ou banco. Conteúdo anterior possivelmente substituído em `/tmp` permanece indeterminado; não executar limpeza ou restauração especulativa.
- **Esforço:** não medido.

## 2026-10-05 — Confirmar o fonte Edge ativo antes de tratar relatos de fluxo como falha de código

- **Contexto:** hotfix de Produção para edições de Jobs/Projetos/Tarefas após cutover relacional.
- **Evidência:** diferença entre as fontes `legacy_records` e relacionais foi confirmada por agregações read-only; o backup da função Prod v2 foi comparado antes do patch e a fonte foi baixada novamente após o deploy. A comparação confirmou byte a byte a correção relacional publicada. A inspeção do mesmo fonte mostrou que criação de Projeto já usa `saveFrozen` e retorna quando `legacy_write_allowed=false`, contrariando a hipótese inicial de que esse ramo ainda tentava a gravação legada.
- **Regra candidata:** antes de corrigir cada causa atribuída a uma Edge Function, inspecionar a versão remota ativa (não apenas o checkout) e seguir o ramo exato da operação; validar a função baixada após deploy. Distinguir observação sobre dado divergente de prova de sobrescrita ou perda.
- **Validações:** testes de seleção **13/13**; build; bundle; comparação pós-deploy; requisição sem sessão recusada com 401. Nenhuma escrita autenticada em Produção.
- **Limites/bloqueios:** CI [37361790804](https://github.com/Seja-Dominio/dominio-maestro/actions/runs/37361790804) falhou por inventário remoto/local inconsistente e scripts ausentes; update autenticado positivo ainda não foi executado. Esforço ativo não medido.
- **Skill candidata:** `dominio-integration-testing` ou `dominio-milestone-execution`; não alterada automaticamente porque a evidência é de um caso e a regra já pode estar coberta no procedimento existente.

## 2026-10-05 — Revalidar o clone específico antes de reutilizar fixtures relacionais

- **Contexto:** prova transacional do RPC de escrita relacional de Jobs, após confirmar a causa do erro visível em Projetos no preview Dev.
- **Evidência:** o clone `maestro_dev_schema_baseline_20261003a` tinha zero FKs em Project/Job/Subtask; o clone `...20261003b` tinha 14 e assinaturas de colunas, constraints, índices, RLS, policies e grants idênticas ao Dev. O clone B ainda tinha apenas 1 dos 7 event triggers globais do Dev. No clone B, sob `service_role`, passaram criação e vínculo same-tenant, update de briefing com histórico e rejeição cross-tenant; a transação foi revertida e as quatro contagens de teste ficaram em zero.
- **Causa confirmada:** clones com nomes e datas parecidos representam baselines diferentes; inspeção prévia de um clone não prova que outro contenha o mesmo schema nem hooks globais.
- **Regra operacional:** vincular cada resultado ao nome exato do banco dentro do container; comparar assinatura do catálogo e event triggers antes de selecionar fixture. Separar o que uma prova DML demonstra do que exige hooks de DDL ou autenticação Edge.
- **Skill:** `dominio-database-migrations` já exige validar objetos do clone, equivalência do baseline e event triggers; não foi alterada para evitar duplicar uma orientação existente.
- **Esforço:** não medido.

## 2026-10-05 — Comparar fonte Edge implantado com checkout antes de corrigir

- **Contexto:** auditoria de tenancy do backend compartilhado Maestro/CXM no Supabase Dev.
- **Evidência:** `maestro-data` estava ACTIVE na v57 (`verify_jwt=false`, SHA `f7df4ce0…25d4b847`); o fonte baixado diferia do checkout em 702 linhas adicionadas e 22 removidas. O checkout não podia ser tratado como fonte de deploy. No fonte ativo, o gateway usa `service_role`, não consome `organization_id` em filtros/gravações e prioriza o papel global do perfil sobre o role assinado da membership; login/refresh transportam tenant e role, mas o gateway não os aplica. O Dev tem uma única organização, logo isolamento e autorização entre tenants continuam não comprovados.
- **Lição aplicada:** antes de editar ou implantar Edge Function, comparar versão/SHA e fonte ativo com checkout; com drift, patchar o artefato ativo ou portar mudanças revisadas, e validar novamente o fonte e `verify_jwt` depois. Não mudar o handler compartilhado enquanto os contratos Maestro/CXM não estiverem separados.
- **Validação/impacto:** inventário somente leitura de Dev, download do fonte para pasta temporária, inspeção do claim de login/refresh, membership agregada sem IDs e comparação com checkout. Reprodução transacional em clone Dev-shaped sob `service_role`: dois tenants ativos, dois registros Notification sem tenant explícito, leitura global por entidade retornou ambos; rollback confirmado sem resíduos. Sem gravação em banco hospedado, migration, deploy ou acesso a Produção/VPS. Esforço ativo não medido.
- **Skill atualizada:** `dominio-database-migrations`, no passo de inventário de Edge Functions; a regra evita tratar versão do checkout como artefato implantado.

## 2026-10-06 — Não chamar PostgreSQL simples de replay limpo Supabase

- **Contexto:** validar a migration `20261005230000_allow_frozen_job_updates_with_unchanged_orphan_refs.sql` sem tocar em Produção nem resetar clones existentes.
- **Evidência:** duas tentativas em databases PostgreSQL sem bootstrap Supabase foram interrompidas antes de validar a sequência pretendida: uma por hooks/extensões que requeriam o banco configurado (`pg_cron` e privilégio de `log_min_messages`), outra em `0003_job_attachments_storage.sql` por ausência de `storage.buckets`. O segundo database temporário foi removido. Em seguida, a migration foi aplicada em clone novo de baseline schema-only com as relações reais e função anterior; as assertions passaram sob `service_role`, o rollback restaurou o hash anterior e a fixture terminou com zero resíduos. Isso prova upgrade/rollback isolado da migration, não replay integral.
- **Lição aplicada:** replay integral exige stack Supabase e seus schemas/extensões gerenciados; `migration up --db-url` contra PostgreSQL simples não é substituto. Baseline schema-only serve para prova de upgrade delimitada e deve ser reportado como tal.
- **Skill atualizada:** `dominio-database-migrations`, etapa 4, com a distinção explícita entre replay Supabase completo e teste de upgrade em baseline schema-only.
- **Esforço:** não medido.
