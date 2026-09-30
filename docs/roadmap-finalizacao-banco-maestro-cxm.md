# Roadmap para finalizar o banco do Maestro e separar o CXM

Atualizado em 2026-09-28. Este plano define o caminho até um banco relacional operacional para o Maestro e um CXM que possa ser hospedado e vendido separadamente, com integração opcional. Não autoriza aplicar migrations em produção por lote.

## Resultado que este plano chama de “banco finalizado”

O banco só será considerado finalizado quando todos estes resultados estiverem demonstrados:

1. O Maestro usa tabelas relacionais como fonte de verdade para os domínios incluídos no produto, sem depender de `legacy_records` para operações de negócio desses domínios.
2. O CXM pode ser implantado em uma instalação/banco independentes, com identidade, organizações, permissões, dados, filas, tarefas agendadas, auditoria, backup e monitoramento próprios.
3. A integração Maestro↔CXM usa contratos versionados e autenticados, com IDs externos estáveis, idempotência, retries e comportamento definido quando um dos produtos está indisponível.
4. O isolamento entre organizações e entre produtos é exercitado por testes positivos e negativos; não depende somente de filtros de interface.
5. Migrations reproduzem o estado a partir de uma base limpa e também atualizam uma cópia representativa do estado atual; nenhum histórico remoto é reescrito para esconder drift.
6. Paridade, fluxos críticos, segurança, restauração e rollback passam gates registrados antes do corte gradual de produção.

“Relacional” não exige transformar cada JSON em dezenas de colunas. Campos usados em joins, filtros, autorização, cálculos e constraints devem ser tipados; payloads externos/evolutivos podem permanecer JSON versionado com retenção e dono explícitos.

## Estado de partida verificado

- Build e 282 testes automatizados locais passaram na revisão mais recente; lint geral segue reprovado por ocorrências fora do escopo imediato, registradas abaixo.
- `verify:migration-files` passou para 152 arquivos; `verify:relational-dispatch` passou para 21 entidades.
- O inventário funcional estático agora passa para 33 entidades fora do registry e 168 operações; os contratos CXM permanecem classificados como domínio separado, sem declarar cutover/runtime concluído.
- O Dev e a Produção têm históricos divergentes do checkout; a branch Supabase de validação agora contém sete registros (base, snapshot guard e três migrations de ACL), mas não é replay completo da aplicação local.
- A branch de validação não prova paridade de dados nem validação ponta a ponta. Produção não foi alterada.
- Há centenas de mudanças locais misturadas entre núcleo, CXM, integrações, migrations e artefatos. Nenhum deploy deve incluir todo o worktree sem seleção e revisão de escopo.

### Progresso verificado em 28/09/2026

- Replay clean-room do checkout: 150/150 migrations aplicadas em ordem; lint Postgres sem erros de schema.
- Em banco vazio com fixtures transacionais: fundação (24 contratos), isolamento (17 asserções), paridade estrutural, product modules e dispatcher passaram.
- Cutover legado global não está pronto: 21 entidades registry ainda permitem leitura legada; há 33 entidades detectadas fora do registry, das quais 29 já estão classificadas com status `not_started` e quatro continuam sem contrato/classificação. O verificador retorna corretamente `safe_to_remove_legacy=false`.
- Produção: consulta apenas de catálogo confirmou grants efetivos `SELECT` e `TRUNCATE` para `anon` e `authenticated` em `legacy_records` e policy de leitura autenticada. Nenhuma alteração de grants foi aplicada por esta sessão; é um P0 a validar/planejar com rollout compatível.
- Esta prova local não resolve drift de versão/checksum dos ledgers Dev/Produção nem valida dados reais, UI/E2E ou CXM standalone. A branch remota atual de validação segue sem replay do checkout.
- Reconsulta subsequente: os ledgers Dev e Produção agora mostram `financial_project_delete_atomic` em versões distintas do arquivo local e as funções catalogadas têm definições/grants iguais entre os ambientes; a origem do deploy ainda precisa ser reconciliada. Os defaults futuros de grants continuam abertos sob `postgres` e `supabase_admin`, por isso a revogação pontual de grants atuais não fecha o hardening.

### Revalidação do goal — 29/09/2026

- No clean-room local (porta 57432), após aplicar a nova migration de exclusão financeira, passaram novamente: fundação tenant (24 contratos), isolamento multi-tenant, paridade relacional (34 entidades), módulos (Maestro/CXM/Ads Brain/Insights), isolamento da fila de follow-up CXM (5 assertions), relações opcionais tenant-aware (12 assertions), estado OAuth Meta e dispatcher. A prova SQL de exclusão Project/FinancialEntry passou com rollback. A suíte de testes Node desta revisão passou 180/180.
- `verify:legacy-cutover` permanece `safe_to_remove_legacy=false`: todas as 21 entidades do registry ainda permitem legacy reads, apesar de writes congeladas; várias entidades fora do registry, incluindo CXM, seguem sem cutover relacional. Portanto isto não autoriza retirar `legacy_records`.
- Reconciliação read-only refeita nos ledgers: checkout 153 migrations; Dev 44; Produção 99. Por versão+nome, Dev tem 30 pares exatos e 13 nomes compartilhados com versões diferentes; Produção tem 17 pares exatos e 80 nomes compartilhados com versões diferentes. Produção mantém duas migrations sem arquivo local correspondente; Dev, uma. Isso não prova equivalência de SQL/efeitos e não permite `migration repair` ou push em lote.
- A inspeção atual encontrou apenas workflow de segurança, nenhum workflow/command que execute release Supabase não-CXM. Criei um inventário versionado e verificador fail-closed para classificar as 26 Edge Functions, manter duas CXM-only fora do candidato não-CXM e bloquear sete funções compartilhadas/mistas até separá-las. O teste do inventário real entra na suíte CI existente. `supabase/config.toml` e o diretório de migrations seguem compartilhados; esse controle protege uma lista candidata, mas não é deploy nem torna o release completo elegível. Um `db push` integral ainda não é pacote segregado.
- Dependências confirmadas pelo uso nas Edge Functions: `cxm-data` usa `cxm_silence_due_jobs`, `legacy_records`, `maestro_collaborators`, `organization_members`, `organization_products` e a RPC `save_cxm_appointment_if_available`; `cxm-deskcomm-sso` usa as tabelas centrais de identidade/organização e `legacy_records`. `dominus-webhook` mistura filas e RPCs `cxm_*` (webhook, pipeline, assignment e silêncio) com `dominus_memory`, `legacy_records` e identidade central. `whatsapp-send` cruza tabelas de WhatsApp do Maestro e do CXM. Extrair CXM exige separar identidade/tenant, workers e o contrato de integração, não apenas omitir nomes de função.
- Testes de código: build passou; a suíte `node --test supabase/functions/_shared/*.test.mjs scripts/lib/*.test.mjs` passou 185/185 após incluir a validação da fronteira. Verificadores de arquivos de migration, dispatcher, inventário funcional e fronteira passaram. `typecheck` falha com milhares de diagnósticos distribuídos em código antigo/generated, inclusive erros existentes em `demoClient.js` e declarações `ImportMeta`; não é gate verde. Não há script npm `test` configurado.
- A branch de teste temporária desta etapa foi removida após a prova, encerrando seu custo horário. A branch histórica `maestro-integrity-validation` segue `MIGRATIONS_FAILED`; foi preservada. Produção não recebeu alterações.

### Revalidação de Ads Brain / Meta OAuth — 28/09/2026, 22:25 Manaus

- O inventário local agora contém 154 migrations; a migration `20260929021956_index_meta_oauth_state_foreign_keys.sql` já estava no checkout no início desta rodada e foi aplicada somente ao clean-room. Seu checksum SHA-256 local é `56a21f6b8d38e4a01251e77c08c154363c3c37351fd9f8d2d0f757011bbedaa7`; o replay foi idempotente e criou os dois índices esperados sobre `maestro_meta_oauth_states`.
- Ledger Dev reconsultado: 49 registros. Comparação por `(version,name)` com 154 arquivos locais: 30 exatos, 18 nomes comuns com versão diferente, 106 sem nome remoto equivalente e um registro remoto sem nome local equivalente. Produção: 99 registros; 17 exatos, 80 nomes comuns com versão diferente, 57 sem nome remoto equivalente e dois registros remotos sem nome local equivalente. A comparação não contém checksum remoto nem demonstra equivalência por si só.
- Dev ganhou cinco entradas com nomes locais conhecidos, mas versões diferentes: `scope_ads_brain_by_organization` (`20260926280000` local / `20260929021859` remoto), `enforce_ads_brain_tenant_relationships` (`20260927203354` / `20260929021901`), `index_ads_authorization_tenant_membership` (`20260927203623` / `20260929021904`), `meta_oauth_single_use_state` (`20260928000832` / `20260929021910`) e `index_meta_oauth_state_foreign_keys` (`20260929021956` / `20260929022013`). Catálogo Dev confirma as FKs de membership/authorization tenant-aware, índices e tabela OAuth com RLS sem policy cliente; contagem de lançamentos Ads sem `organization_id` = 0. As constraints compostas ainda não aparecem em Produção; lá não há `maestro_meta_oauth_states`, embora as contas Ads não tenham `organization_id` nulo.
- O código remoto `meta-ads-oauth` não acompanha a migration OAuth: Dev está na versão 40 e Produção na 67; nenhuma versão consulta `maestro_meta_oauth_states`. A cópia local, por outro lado, já persiste e consome nonce de uso único. Portanto a migration OAuth observada no Dev não está sendo usada pela Edge Function em execução, e o efeito de segurança completo ainda não foi entregue/testado como fluxo. Não fiz deploy remoto.
- A comparação dos `statements` do ledger Dev com os arquivos locais deu SHA-256 idêntico para as cinco migrations acima, embora seus números de versão remotos sejam diferentes. Isso confirma identidade exata dos blocos SQL desses cinco casos no Dev; não se estende aos outros 149 arquivos nem à Produção.

### Revalidação clean-room e ACL de `legacy_records` — 29/09/2026

- O checkout contém 152 migrations; o replay foi repetido integralmente em banco local descartável isolado, incluindo as migrations `financial_project_delete_atomic` e três ajustes de ACL para `legacy_records`. `supabase db lint --local --schema public --level error` não encontrou erros.
- Passaram no replay atual os verificadores de fundação (24 contratos), isolamento multi-tenant, paridade relacional e módulos de produto; dispatcher relacional permanece 21/21. Privilégios efetivos locais confirmam CRUD somente para `service_role`, sem `TRUNCATE`/`REFERENCES`/`TRIGGER` e sem SELECT para `anon`/`authenticated`. `git diff --check` sem erros.
- Teste Node executado diretamente: 282 passaram, 0 falharam. Não existe script `npm test` neste checkout.
- `verify:legacy-cutover` retorna `status: ok`, mas `safe_to_remove_legacy=false`: as 21 entidades ainda permitem leitura legada. Não remover `legacy_records`.
- O inventário funcional anteriormente falhava em quatro contratos CXM; a classificação estática foi fechada nesta rodada para as 33 entidades fora do registry, 168 operações e 23 contratos de acesso. Isso fecha a cobertura documental; não valida a execução runtime nem conclui o CXM standalone.
- A branch Supabase `diljbmxxlsqyxcqnraba` registra a revogação cliente, grant de CRUD ao `service_role` e restrição de privilégios extras; as migrations foram validadas somente nessa branch isolada. Não foram aplicadas em Dev ou Produção.
- O mapa e o inventário classificam agora as quatro lacunas CXM e suas operações; `verify:functional-inventory` retorna `status: ok`, 22 rotas, 23 contratos de acesso, 49 entidades e 168 operações. Os quatro domínios continuam `not_started` para cutover e exigem testes de runtime/standalone.
- Nenhuma prova acima encerra reconciliação de conteúdo/checksum dos ledgers Dev/Produção, inventário de consumidores do backend, defaults de grants por todos os owners, atualização representativa, E2E, backup/restauração nem rollback de release. Produção permanece sem alteração nesta etapa.
- Comparação read-only do catálogo (registrada em `docs/migration-drift-reconciliation.md`) confirma diferença estrutural mensurável entre Dev (25 relações), Produção (58) e clean-room (68); a revisão de `resolve_job_task_reconciliation` também encontrou `SECURITY DEFINER/search_path=public` em Produção versus `SECURITY INVOKER/search_path vazio` no replay. Roles cliente não têm EXECUTE nessa função, mas a divergência exige reconciliação antes de promover.

### Exercício de backup/restauração — 29/09/2026

- A validação foi restrita ao container clean-room local (`maestro-clean-room.xjrrql`, PostgreSQL 17.6); nenhum dump, dado ou segredo de Dev/Produção foi consultado ou exportado.
- Um round-trip inicial com `pg_dump -Fc` bruto falhou ao restaurar o cluster Supabase para um banco PostgreSQL genérico: objetos gerenciados (`pg_cron`, `vault` e funções internas/permissões) não são restauráveis nesse alvo. O banco descartável e o schema canário foram removidos pelo cleanup do teste. Esta falha confirma que esse método bruto não é procedimento de recuperação válido; não indica corrupção dos bancos remotos.
- A CLI Supabase 2.115.0 está instalada. `supabase db dump --local --dry-run` foi verificado para schema e dados: o caminho de schema exclui schemas internos gerenciados e o caminho de dados exclui schemas/tabelas de migrations internas. Isso valida a geração do comando filtrado, não a restauração dos dados.
- Em seguida, foi feito um round-trip lógico real sem arquivos de dump: `supabase db dump` da origem clean-room (porta 57432) foi transmitido diretamente para um novo stack local Supabase/Postgres descartável (porta 57442), inicialmente vazio. A importação do schema e dos dados terminou sem erro. As contagens de todas as tabelas públicas, ordenadas por relação, produziram SHA-256 idêntico entre origem e destino (`18fa089bd90bfc28ec7705e797827a9dd92bd5d9a32b732cfbf136cfa8c12f6c`).
- A comparação de catálogo também coincidiu: 68 relações públicas (66 tabelas-base), 301 constraints, 271 índices, 135 policies, 52 funções, 24 triggers, mesmo conjunto de extensões e roles; 103 FKs foram revalidadas no destino, zero constraints públicas ficaram não validadas, e `supabase db lint` no destino não encontrou erros. O schema interno `supabase_migrations` (ledger com 152 entradas na origem) foi intencionalmente excluído pelo dump filtrado e não existe no destino; o hash/contagem de migrations não faz parte da paridade de dados deste restore.
- O stack descartável foi parado com remoção do volume que pertencia exclusivamente a ele. Clean-room e container de replay prévios permaneceram ativos e inalterados. Nenhum arquivo de dump foi deixado no disco.
- O clean-room atualmente tem somente o container Postgres ativo; Auth, Storage, Realtime e demais serviços estão parados. Portanto ainda não foi demonstrado um restore end-to-end Supabase-aware nem a recuperação de Auth/Storage/Edge Functions, secrets, configurações, publications e jobs.
- Este round-trip comprova recuperação lógica de schema/dados PostgreSQL do clean-room, não backup/restore operacional completo: o alvo de teste teve apenas Postgres ativo; não foram exercitados o dump/restauro de roles via `--role-only`, autenticação de usuários, objetos de Storage, Edge Functions, secrets, configurações, filas/jobs externos, publicação Realtime, fluxos de UI/API nem latência/RPO/RTO. Não continha dados de produção e não acessou ambientes remotos.
- Gate de backup/restauração segue **parcial/aberto**: falta exercício em projeto Supabase descartável com Auth/Storage e integrações ligados, validar roles e configuração/secrets pelo processo documentado, testar fluxos críticos de ambos os produtos e medir RPO/RTO. Para recuperação física gerenciada, usar “Restore to a new project” em branch/projeto descartável e auditar extensões que podem voltar a executar jobs externos.
- Não foi criado backup externo de Produção e nenhuma configuração/migration foi aplicada remotamente nesta etapa.

### Inspeção read-only do spike Deskcomm/CXM — 29/09/2026

- O stack local `deskcomm-cxm-spike-20260928` permanece ativo em portas próprias e tem Postgres 15.8, Auth, Storage, REST, Realtime, Kong e Inbucket; endpoints locais Auth, Storage e REST responderam HTTP 200. Nenhum dado foi escrito durante esta inspeção.
- O catálogo do banco contém 185 tabelas públicas com RLS habilitado, 609 policies, 499 FKs originadas em `public` e 166 tabelas com coluna `organization_id`; existem 2 organizações e 7 vínculos em `user_organizations`. A única FK pública cujo destino está fora de `public` aponta para `_realtime.tenants`, relação interna da plataforma. Isso é evidência de infraestrutura e modelo tenant presentes, não prova de autorização runtime: não foram exercitados JWTs de tenants diferentes nem operações allow/deny.
- Não há objetos públicos nomeados com `maestro` nem tabela `public.legacy_records` nesse banco isolado. Porém o diretório desse stack tem apenas `supabase/config.toml`, `supabase/baseline.sql` e templates de Auth; Edge Runtime está desabilitado e não há código de aplicação, diretório versionado de migrations ou ledger `supabase_migrations.schema_migrations`. O baseline identifica DeskcommCRM v0.1; não é o repositório/runtime da aplicação CXM atualmente integrado ao Maestro.
- Conclusão restrita: há uma instalação local com serviços próprios e isolamento de dados em nível de infraestrutura, mas isso **não comprova CXM standalone** nem pode substituir os contratos/migrations das funções CXM no Maestro. Antes de contar esta instalação como entrega, é necessário ligar o código CXM real ao schema, versionar bootstrap/upgrade, rodar fluxos com Auth e Storage e demonstrar isolamento entre duas organizações.

## Fases de execução e gates

### Revalidação clean-room ampliada — 30/09/2026

- A branch candidata `codex/maestro-db-canonical-candidate` contém 172 arquivos de migration locais. No commit `beca243e`, o workflow GitHub Actions `36751215708` terminou com sucesso em todos os jobs: replay integral desde banco vazio, lint do schema público, testes de autorização/regressão, limites de produto das Edge Functions, análise estática de segurança e busca de segredos.
- O contrato SQL rollback-only agora cria duas organizações e testa visibilidade isolada de memberships/clientes; rejeição de relações cruzadas projeto→cliente, job→projeto, tarefa→job, responsável de tarefa e lançamento→conta bancária; e privilégios financeiros diretos negados para `anon`/`authenticated` e CRUD preservado para `service_role` nas quatro tabelas financeiras. Fixtures e grants temporários são revertidos por `ROLLBACK`.
- Isso comprova replay limpo e as constraints/permissões presentes na sequência local candidata; não comprova upgrade de snapshots Dev/Produção, equivalência de migrations já registradas remotamente, paridade dos dados reais, fluxos de UI/API, nem deploy standalone do CXM. Nenhuma escrita foi feita nos projetos Supabase hospedados.
- A leitura remota mais recente registrada nesta sessão encontrou novo desvio entre o checkout de 172 migrations e os ledgers consultados (Dev: 83 entradas; Produção: 111), além de diferença de catálogo (38 relações no Dev e 58 em Produção; 28 relações somente em Produção e 8 somente em Dev; 133 policies exclusivas de Produção e sete definições de função divergentes). Esses números são uma fotografia dos ambientes no momento da consulta e precisam ser reconciliados por migration/efeito; não autorizam `migration repair`, push em lote ou promoção da branch candidata.
- Próximo gate obrigatório: gerar e revisar a reconciliação migration-a-migration com provas de efeitos e dependências; em seguida criar snapshots anonimizados/representativos e provar upgrade em bancos descartáveis que reproduzam os catálogos divergentes. Até esse gate passar, não aplicar a sequência integral em Dev/Produção nem declarar o banco pronto para corte.

### Fase 0 — congelar escopo e tornar o inventário auditável

**Atividades**

- Confirmar a lista de módulos do Maestro: núcleo operacional, Financeiro, Produção/Documentos, Ads Brain e Insights; marcar CXM como produto isolável, não incluído nos deploys desta trilha.
- Fechar matriz entidade × tabela × Edge Function/API × consumidor × operações × tenant dono × fonte de verdade.
- Classificar entidades não relacionais como `relacional`, `legado temporário`, `configuração`, `cache/snapshot`, `CXM separado` ou `fora de escopo`, cada qual com responsável e teste.
- Resolver as quatro lacunas CXM do verificador no inventário CXM próprio, sem alterar o gate do pacote Maestro para fingir que não existem.
- Remover arquivos gerados/temporários do conjunto candidato e criar listas de arquivos exatas por entrega.

**Aceite**: nenhum consumidor/tabela sem domínio, dono ou decisão de persistência; verificadores funcionais passam separadamente para o escopo Maestro e para o inventário CXM.

### Fase 1 — reconciliar migrations e história dos ambientes

**Atividades**

- Construir tabela por migration local com versão, checksum, objetos/efeitos, dependências, ambiente aplicado e evidência de equivalência.
- Marcar cada caso como `aplicada idêntica`, `efeito equivalente com nome diferente`, `pendente`, `aplicada só em branch`, `CXМ`, `scheduler/segredo` ou `conflito`. Não assumir equivalência pelo nome ou pela presença de uma tabela.
- Capturar snapshots do ledger Dev, validação e produção; manter produção em leitura até que o candidato esteja reconciliado.
- Corrigir migrations-base para bootstrap limpo e replay determinístico; validar ordem, idempotência, extensões e dependências de segredos.
- Gerar dois testes independentes: replay desde zero e upgrade desde um snapshot representativo. Não forçar inserções no ledger sem provar todos os efeitos correspondentes.

**Aceite**: 100% das migrations da trilha têm classificação e ordem; replay limpo e upgrade da branch terminam sem erro; objetos esperados são verificados no catálogo. Nenhuma divergência conhecida fica escondida.

### Fase 2 — fechar fundação multi-tenant e segurança

**Atividades**

- Definir organização como chave de isolamento transversal; mapear usuário autenticado a membership/colaborador sem inferência por “primeira organização”.
- Validar `organization_id NOT NULL`, unicidade por tenant, FKs compostas tenant-aware e ações `ON DELETE` em entidades centrais e de produto.
- Auditar grants, policies RLS, views, RPCs, funções `SECURITY DEFINER`, defaults de grants, service role e todas as rotas server-side.
- Revogar acesso direto excessivo a `legacy_records` e tabelas server-managed em ambiente isolado; provar negação para `anon`, usuário de outro tenant e membro sem papel, preservando operações `service_role` necessárias.
- Definir entitlement de módulo separado de papel do usuário: ativação do CXM/Ads Brain/Insights por organização/instalação.

**Aceite**: matriz de permissões coberta por testes de allow/deny; nenhuma relação cross-tenant aceita; todos os objetos expostos têm owner, privilégio e motivo documentados.

### Fase 3 — resolver qualidade e exceções dos dados do núcleo

**Atividades**

- Triar os 4 jobs sem referência válida e as 496 subtarefas órfãs usando evidência auditável, sem associação por título ou status.
- Se não houver fonte confiável, preservar como exceção histórica classificada com regra de retenção; não bloquear o sistema inventando vínculo.
- Rodar reconciliação de duplicatas, IDs faltantes, referências inválidas, organização divergente, enum/status desconhecido e timestamps.
- Backfills devem ser repetíveis, por lotes, com contagens antes/depois, checkpoint, logs de erro e possibilidade de retomada.

**Aceite**: toda exceção tem estado/responsável/retensão; nenhuma inconsistência silenciosa; segunda execução do backfill não duplica nem altera indevidamente registros.

### Fase 4 — completar modelo e contratos relacionais do Maestro

**Atividades**

- Definir fonte de verdade e contrato para cada entidade por domínio. Priorizar dados usados por permissões, relações, filtros ou cálculos.
- Completar modelo relacional do núcleo (Client, Project, Job, tarefas/subtarefas, comentários/histórico, anexos, timesheets, agenda, notificações) e dos domínios habilitados do Maestro.
- Resolver entidades fora do registry, incluindo contratos de CRUD, exclusão, paginação, ordenação e audit trail; declarar explicitamente as que permanecerão fora do corte.
- Separar `maestro-data` em adapters/serviços por domínio em fatias seguras, ou estabilizar contratos e testes equivalentes antes de extrair. Uma mudança genérica não pode alterar consumidores não relacionados.
- Formalizar regras de negócio/calculadoras compartilhadas entre tela, relatórios e exportação.

**Aceite**: todas as operações expostas têm teste de contrato por papel e tenant; nenhuma relação central depende somente de JSON ou de validação de UI; as 21 entidades configuradas têm dispatcher/configuração/registry coerentes.

### Fase 5 — paridade e corte relacional por domínio do Maestro

**Ordem sugerida de fatias**

1. Núcleo Client/Project/Job e tarefas, preservando a fila de exceções.
2. Comentários, histórico, anexos e aprovações.
3. Financeiro, dimensões e lançamentos, com regras específicas para categorias e referências históricas.
4. Agenda, timesheets e notificações.
5. Documentos/templates, IA/logs operacionais e demais entidades do produto.
6. Ads Brain e Insights, mantendo contratos de produto/tenant e sincronizações externas independentes.

**Para cada fatia**: expandir schema → backfill → validar contagens/IDs/payload → dual-write temporário (se necessário) → comparar leituras reais → trocar leitura → observar erros e divergências → congelar escrita legada → só então retirar fallback daquele domínio.

**Aceite por fatia**: paridade bidirecional sem divergência não explicada; integração, autorização e regressão da UI passam; rollback documentado e testado; demais domínios inalterados.

### Fase 6 — construir CXM como produto instalável independente

**Atividades**

- Definir boundary próprio: schema/migrations, API/Edge Functions, autenticação/tenancy, secrets, filas, cron, storage, logs, billing/entitlements e política de retenção.
- Separar dados CXM de tabelas de núcleo; onde precisar de cliente/job/usuário do Maestro, guardar IDs externos e snapshot mínimo necessário, não FK cross-database.
- Versionar contrato de integração: provisionamento/credenciais, sync de organizações e usuários, clientes/contatos permitidos, eventos, webhooks, idempotency keys, retry/DLQ, revogação e reconciliação.
- Definir modo standalone (CXM com cadastros próprios) e modo conectado ao Maestro; escopos e consentimentos devem ser explícitos.
- Incluir migrations e seeds de instalação limpa, upgrade, operação sem dependência do Maestro e desinstalação/retensão exportável.
- Isolar workers/schedulers por ambiente e instalação; testar falha de fornecedor, replay de webhook, duplicidade, rate limit e rotação de segredo.

**Aceite**: CXM sobe e executa seus fluxos principais em ambiente novo sem banco ou função do Maestro; integração opcional reconecta sem duplicar nem cruzar tenants; dados podem ser exportados e recuperados.

### Fase 7 — endurecer operação, recuperação e escala

**Atividades**

- Definir SLOs de disponibilidade, latência, filas, sync e recuperação por produto.
- Testar backup e restauração para Maestro e CXM separadamente, incluindo secrets/configuração necessários e verificação de consistência restaurada.
- Testar carga representativa, índices com `EXPLAIN`, contenção de jobs, paginação e limites por tenant; corrigir apenas problemas medidos.
- Implementar observabilidade sem payload sensível: migrações, paridade, falhas de integração, DLQ, RLS denies, latência e uso por módulo.
- Executar exercícios de falha e rollback em homologação, incluindo indisponibilidade do CXM sem afetar o Maestro e vice-versa.

**Aceite**: restauração dentro de RPO/RTO definidos; alertas acionáveis; nenhuma falha isolada de um produto derruba o outro; capacidade validada para carga-alvo acordada.

### Fase 8 — homologação completa e lançamento gradual

**Atividades**

- Congelar commit candidato e gerar manifest explícito de código, migrations, funções, variáveis e módulos incluídos/excluídos.
- Fazer replay clean-room, upgrade, testes de isolamento, paridade e fluxo end-to-end num ambiente representativo.
- Revisar segurança/advisors, logs, backup, rollback, feature flags e plano de monitoramento.
- Publicar primeiro em ambiente de homologação; fazer smoke test de cada módulo Maestro e do CXM independente/conectado.
- Liberar produção por domínio/tenant com janela de observação e botão de desligamento; interromper corte se houver divergência, aumento de erro ou impacto em módulo fora do escopo.

**Aceite final**: Maestro funcional com fonte relacional para todo o escopo declarado; CXM standalone funcional e integrado por contrato versionado; testes, backup/restauração, segurança e rollback aprovados; nenhuma dependência CXM oculta no release do Maestro; relatório pós-deploy sem regressão.

## Dependências e paralelismo

- Fases 0 e 1 começam primeiro e bloqueiam qualquer corte persistente.
- O desenho dos contratos CXM pode ocorrer em paralelo às fases 1–5, mas migrations/deploy do CXM ficam em trilha e ambiente próprios.
- Segurança multi-tenant (fase 2) bloqueia abertura de acesso e ativação geral de módulos.
- Triagem de exceções (fase 3) pode ocorrer junto do desenho relacional; bloqueia somente constraints/backfills que afetem esses registros.
- Fases 5 e 6 podem avançar em paralelo em branches/ambientes isolados; a fase 8 integra os resultados depois.

## Primeiro lote de execução recomendado

1. Atualizar este roadmap apenas com evidência confirmada, preservando snapshots datados anteriores.
2. Gerar reconciliação completa dos 149 arquivos locais contra Dev, branch de validação e produção, com classificações e dependências.
3. Criar release manifest não-CXM apenas depois de a reconciliação provar sequência mínima; manter CXM, workers e migrations associadas fora.
4. Preparar branch limpa de validação e provar bootstrap/replay da sequência escolhida; não usar o branch atual de quatro migrations como se fosse validação completa.
5. Escolher uma fatia não-CXM pequena, executar paridade/isolamento/contratos e obter gate de homologação antes de seguir para a próxima.

## O que não fazer

- Não executar `db push` do diretório inteiro, não reconciliar ledger apenas com inserções manuais e não reescrever versões aplicadas.
- Não aplicar alterações em produção enquanto branch de validação e histórico não forem reprodutíveis.
- Não apagar `legacy_records`, dados órfãos, snapshots ou tabelas CXM como parte deste plano sem uma etapa própria de exportação, backup e decisão aprovada.
- Não compartilhar banco entre produtos como requisito de integração: podem compartilhar infraestrutura inicialmente, mas os limites precisam permitir implantação e evolução independentes.
- 29/09: fechada uma lacuna no contrato de exclusão financeira: o snapshot de recuperação (`DeleteLog`), auditoria, exclusão do registro legado e remoção da projeção agora são atômicos na RPC; a interface deixa de criar o snapshot em chamada separada. Prova rollback-only passou no clean-room (replay anterior + migration aplicada isoladamente) e em branch Supabase isolada sem dados. Esta correção ainda não foi promovida a Produção.

### Gate fail-closed da fronteira de Edge Functions — 28/09/2026

- A auditoria mostrou que os testes unitários do manifesto já eram incluídos pelo glob `scripts/lib/*.test.mjs`; o workflow `.github/workflows/security-checks.yml`, porém, não chamava o verificador do inventário real e `package.json` não oferecia um comando dedicado. Adicionei `verify:edge-function-product-boundaries` e um passo explícito no job de testes para validar e reportar a lista real classificada em cada CI.
- Verificação local passou: 27 funções classificadas, 17 no candidato não-CXM, duas CXM-only e sete bloqueadas por dependências compartilhadas; `release_ready=false`. A suíte completa desta rodada passou 185/185, inclusive cinco testes da fronteira.
- O passo de workflow existe apenas no worktree atual e ainda não foi executado pelo GitHub; workflow, manifesto, verificador e teste estão untracked, enquanto `package.json` está modificado. O gate só passa a proteger a branch quando todos forem incluídos juntos num commit e enviados. Também não existe pipeline real de deploy/allowlist por produto; este ajuste não autoriza nem impede, por si só, um deploy manual.

### Revisão de sessão por organização e operações administrativas de timesheet — 30/09/2026

- O login de colaborador agora seleciona uma membership ativa do banco; usuários de organização única mantêm compatibilidade sem campo extra e usuários com várias organizações precisam selecionar uma. O token fixa `organization_id`, e o endpoint `maestro-data` revalida membership/organização em cada chamada, deriva o nível de acesso da role da membership e limita operações `legacy_records` à organização da sessão.
- Os tokens de grupo assinados pelo `dominus-webhook` passam a carregar a organização resolvida da tabela relacional de grupos; `maestro-data` rejeita tokens de grupo sem esse claim. A consulta do grupo exige vínculo único a uma organização ativa.
- `admin-timesheets` deixou de confiar no `profile.access_level` global. Agora exige role administrativa numa membership ativa e chama as RPCs relacionais tenant-scoped já existentes para exclusão/auditoria atômica e reset de timers. Não grava diretamente em `legacy_records`.
- Provas locais: 20 testes Node passaram; build Vite passou; `git diff --check` passou. O teste SQL de CI foi ampliado para tentar excluir um timesheet de outro tenant na mesma chamada, conferir snapshot de auditoria no tenant correto e verificar que o reset de timers não altera a outra organização. Esse SQL **ainda aguarda execução no CI**, porque o daemon Docker local não está disponível.
- Limite da conclusão: outros endpoints com `service_role` ainda têm acessos legados sem filtro tenant-aware; as sessões autenticadas pelas demais Edge Functions, a associação dos endpoints mistos ao contrato dos produtos e a atualização representativa do banco ainda precisam ser auditadas. Nenhum deploy em Supabase Dev/Produção ocorreu. Esta fatia não encerra o gate da fase 2, nem a fase 5 ou o goal.
- O commit `3d29bf4e` foi enviado à branch candidata; o workflow GitHub Actions `36755522638` concluiu com sucesso: replay integral das migrations, lint público, contratos SQL tenant-isolation (incluindo exclusão/reset de timesheet), testes Node, fronteira de produto, Semgrep, Trivy e secret scan.
- Segunda fatia: `maestro-ai` agora deriva role de membership ativa, exige `organization_id` válido, limita consultas de entidades e Ads Brain à organização, valida o cliente antes de chamar o serviço MMM e inclui o tenant no audit log. Testes Node (21/21), transpilation syntax check das Edge Functions alteradas, build Vite e `git diff --check` passaram localmente. O commit `44959576` foi enviado e o workflow `36756085499` passou integralmente: replay das migrations, lint público, SQL multi-tenant, testes de regressão, fronteira de produto, Semgrep, Trivy e secret scan.
- Terceira fatia: `team-chat` agora revalida a membership e organização ativas na sessão; lista canais, autores e colaboradores, mensagens e reações somente dentro do tenant. Escritas de mensagem/reação incluem `organization_id`; consultas e remoção de reações também o filtram, alinhadas às FKs compostas já existentes. O commit `9f3e58b5` foi enviado à branch candidata; workflow `36757297855` passou integralmente, incluindo replay limpo das migrations, teste SQL de isolamento, testes Node, análise estática, dependências e segredos. Nenhum deploy Supabase foi feito.
- Quarta fatia: `hash-collaborator-password` exige sessão com membership ativa e papel administrativo na organização escolhida, valida membership ativa do colaborador-alvo na mesma organização, e limita a mudança global a login/senha. Testes Node (23/23), esbuild, build Vite e `git diff --check` passaram; commit `c987700d` enviado, workflow `36757885440` passou integralmente incluindo replay das migrations e SQL multi-tenant. Caveat confirmado: `maestro-data` ainda espelha alguns atributos de colaborador no perfil global de autenticação, e o ledger usa chave global `(entity, record_id)`; permissões customizadas e representação de membro por organização precisam de normalização relacional antes de afirmar suporte íntegro a colaboradores multi-organização. Nenhuma credencial hospedada foi alterada.
- Quinta fatia: `dominus-memory` deriva role de membership ativa e limita reviews, regras de memória, comentários, eventos, aprovações, rejeições, edição e rollback lógico à organização selecionada. As inserções explicitam `organization_id`, coerentes com as FKs tenant-aware existentes. Testes Node (24/24); workflow `36758335086` passou com replay limpo das migrations e SQL multi-tenant.
- Sexta fatia: `system-reports` exige role `master` da membership ativa e limita relatório/blueprint e entitlement à organização da sessão; não confia no papel global do perfil. Testes Node, esbuild e `git diff --check` passaram; validado em CI pelo workflow `36758530890`.
- Sétima fatia: `traffic-copilot` revalida membership/organização ativa, deriva o nível de acesso da role relacional e filtra contas Ads Brain por tenant, inclusive para IDs indicados pelo usuário. Testes Node, esbuild e `git diff --check` passaram; em conjunto com a sexta fatia, workflow `36758674828` passou integralmente.
- Oitava fatia: `meta-ads-oauth` deriva autorização Ads Brain da membership ativa, aplica `organization_id` a leitura/escrita/sincronização/remoção de contas e tokens, isola clientes e métricas competitivas pelo tenant e vincula o estado OAuth ao colaborador e organização que iniciaram o fluxo. Testes Node (27/27), esbuild e `git diff --check` passaram; commit `9d23d3c2` enviado, workflow `36759174381` ainda em execução. Nenhum acesso à Meta ou deploy foi realizado nesta validação.
- Nona fatia local (ainda sem commit/CI): links públicos de aprovação de Job agora resolvem a organização pela linha assinada do próprio Job e rejeitam registros sem tenant; atualização de status, histórico, comentário e notificação são gravados com o mesmo `organization_id`, sem tornar a rota pública dependente de uma sessão de colaborador. Testes Node (28/28), esbuild e `git diff --check` passaram; nenhum link real foi usado.
- Nona fatia: a rota pública de aprovação foi enviada no commit `f6405579`; workflow `36759351503` passou integralmente.
- Décima fatia: uploads passam a exigir membership ativa, prefixam objetos novos com `organization_id` e rejeitam token de grupo; renovação de URL exige sessão/membership ativa, organização ativa, leitura autorizada do Job e prova de que o caminho consta nos anexos do Job ou em comentário. O cliente agora envia o identificador do Job. Testes Node (20/20), build Vite, transpilation das duas Edge Functions e `git diff --check` passaram. Workflows prévios das fatias Ads/OAuth e aprovação (`36759174381`, `36759351503`) passaram; a fatia de anexos segue sem commit/CI nesta nota. Sem migração/remoção de arquivos do Storage e sem deploy; anexos legados continuam preservados, mas renovações passam a depender de estarem registrados no Job/comentário.
