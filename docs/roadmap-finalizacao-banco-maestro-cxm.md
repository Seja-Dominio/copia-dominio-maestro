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
- Produção (snapshot histórico de 28/09): catálogo indicava grants efetivos `SELECT`/`TRUNCATE` e policy de leitura em `legacy_records` para roles cliente. A rechecagem read-only de 30/09 nesta revisão encontrou `anon` e `authenticated` sem privilégios efetivos na tabela; `service_role` mantém CRUD e `TRUNCATE`. O achado histórico fica preservado, mas não descreve o estado efetivo observado agora; ainda falta auditar policies/default privileges e tabelas server-managed por owner.
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

### Estimativa consolidada do goal — 30/09/2026

- Progresso estimado: **40%**. Régua: média ponderada das nove fases 0–8, considerando a quantidade e criticidade dos critérios de aceite comprovados, não número de commits ou arquivos. Fase 0: substancialmente concluída no inventário funcional e nas fronteiras estáticas, mas falta reconciliar consumidores/runtime; fase 1: parcial (replay limpo e ledger quantificado, porém sem classificação/efeitos para todas as migrations nem upgrade representativo); fase 2: parcial (contratos e vários testes tenant passaram, mas faltam auditar todas as funções/endpoints/grants); fases 3–5: parciais, sem conclusão de exceções, paridade e cutover de todos os domínios; fase 6: spike de infraestrutura CXM não prova a aplicação standalone; fase 7: restore lógico Postgres foi exercitado, mas operação Supabase completa, SLO/carga e rollback permanecem abertos; fase 8: não iniciada para homologação/corte.
- A estimativa anterior de 82% foi retirada por não refletir a definição de pronto do próprio roadmap: ela superestimava provas locais/CI como se fossem paridade operacional, upgrade, CXM independente e recuperação integral.
- Evidências mais fortes em 30/09: branch candidata `codex/maestro-db-canonical-candidate`, commit `e80ddda6`; CI `36763101452` verde para replay limpo/testes/segurança; reconciliação de ledger e catálogo read-only em `docs/migration-drift-reconciliation.md`; inventário de Edge Functions ainda `release_ready=false`; restore lógico clean-room passou somente para schema/dados PostgreSQL.
- Gate bloqueante mais próximo: classificar e provar por efeito as divergências de migration Dev/Produção, então exercitar upgrade em clones descartáveis que reproduzam os catálogos. Nenhum `migration repair`, `db push` integral, corte ou escrita em Produção é permitido por esta estimativa.

### Classificação por efeito de migrations — 30/09/2026

- Auditoria adicional `READ ONLY`: `maestro_apply_legacy_mutation` em Dev, Produção e arquivo local tem o mesmo comportamento após normalizar a refatoração de `v_effective_payload`; assinatura, `SECURITY INVOKER`, `search_path` vazio e EXECUTE somente por `service_role` também coincidem. Classificado como efeito equivalente com histórico/versionamento diferente, não como bug de runtime.
- A fila webhook CXM do Dev mantém sobrecargas de enqueue de três e quatro argumentos; ambas estão limitadas a `service_role`, mas o consumidor da sobrecarga antiga ainda não foi identificado. Produção não tem a fila. A relação `cxm_silence_due_jobs` existe somente em Dev, com a FK antiga ausente como a migration local pretende. Essas diferenças ficam na trilha CXM e fora do pacote não-CXM.
- Evidência e limites estão em `docs/migration-drift-reconciliation.md`. A reconciliação global continua incompleta; não houve alteração remota e não se autoriza repair/push. Próxima ação: ampliar a classificação dos pares com SQL divergente e mapear consumidores/runtime para funções e schedulers compartilhados, depois preparar clones descartáveis para upgrade.

### Revalidação estática da fronteira de Edge Functions — 30/09/2026

- O verificador do manifesto foi executado no commit atual: 18 diretórios classificados; três funções na lista candidata, seis bloqueadas como compartilhadas e oito pendentes não-CXM; resultado estrutural `status: ok`, mas `release_ready=false` com 14 bloqueios de release. Duas funções CXM (`cxm-data`, `cxm-deskcomm-sso`) seguem como exclusões explícitas porque não existem na árvore atual.
- A varredura da árvore atual de `supabase/functions` não encontrou referências literais `cxm_*`/`CXM` em código de função. Portanto a anotação anterior que atribuía chamadas diretas `cxm_*` a `dominus-webhook` e `whatsapp-send` está desatualizada para este commit e não deve ser usada como inventário atual. Ausência de nomes literais não prova isolamento: funções usam `legacy_records` dinamicamente e o manifesto valida classificação/árvore, não dependências de runtime.
- Evidência que mantém bloqueios relevantes: `maestro-data` aceita `entity` dinâmica sobre `legacy_records`; `whatsapp-send` usa `service_role`, deriva autorização de perfil global e faz operações/listagens/scheduler em `legacy_records` sem `organization_id`. Ela também usa configuração global `EVOLUTION_*`. Essas rotas precisam ser tenant-scoped e/ou separadas por instalação antes de serem candidatas a release multitenant; não as reclassificar só porque não citam CXM pelo nome.
- Nenhum código ou dado foi alterado nesta auditoria. Próxima ação: definir entidade/instalação permitida por produto no contrato de sessão, mapear todos os consumidores de `legacy_records` e desenhar credenciais/conexões WhatsApp por organização; então corrigir e testar essas rotas, mantendo o gate fechado até lá.
- A reconsulta agregada das tabelas do domínio WhatsApp confirmou que o registry classifica contatos, grupos e automações como CXM. Dev não tem `organization_integrations` nem as tabelas relacionais de WhatsApp e mantém um registro legado de automação; Produção tem integração ativa para uma organização e 2.662 contatos, 290 grupos e 4 automações, todos tenant-scoped, sem linhas legadas sem organização. Não foram lidos dados pessoais/payloads e nenhuma escrita foi feita. Assim, Dev não serve como snapshot representativo do estado atual de produção para essas entidades; falta clone anonimizado e prova de upgrade/backfill. O código ainda resolve credenciais Evolution globalmente, sem consulta ao vínculo por organização. Evidência detalhada no relatório de drift.
- Implementação local: o dispatcher `maestro-data` agora valida entitlement da organização contra `legacy_cutover_registry` antes do CRUD para entidades classificadas como CXM/Insights/outro produto; seis entidades não-Maestro do seed têm fallback canônico para não depender de uma linha remota atrasada, e conflito de classificação é negado. `maestro-ai` também verifica CXM antes de consultar Propostas. Teste garante que os fallbacks coincidem com o seed da migration. Suíte Node 35/35 passou; as duas Edge Functions transpilaram; `git diff --check` passou. Ainda requer CI após push.
- Limites: não houve deploy. A UI/menu/rota ainda não esconde Propostas quando CXM está desabilitado; entidades fora do registry e sem fallback continuam sem gate de produto explícito; as demais rotas compartilhadas e as credenciais WhatsApp por organização também seguem abertas. Este guard server-side é uma fatia, não fecha a fronteira de produto nem torna `release_ready=true`.

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

## Ordem de execução priorizada — revisão de 30/09/2026

### P0 — manter os limites de segurança e congelar uma base auditável

- Usar como candidato apenas a branch `codex/maestro-db-canonical-candidate`; o commit `0cdf5e66` tem CI verde (`36784721927`), incluindo teste `service_role`, replay limpo das 173 migrations, lint, verificadores e análise estática.
- Manter flags de leitura relacional desligadas em produção; não aplicar `db push`, `migration repair`, mudanças de grants ou deploys manuais enquanto os gates abaixo não passarem.
- Preservar produção em leitura. O spot check read-only de 30/09 não encontrou privilégios efetivos em `legacy_records` para `anon`/`authenticated`; `service_role` tem CRUD e `TRUNCATE`. Auditar policies/default privileges por owner e demais tabelas server-managed antes de declarar o hardening fechado; a correção de grants, se ainda necessária, exige prova isolada e rollout compatível.
- A rechecagem encontrou FKs simples, ausência dos três `UNIQUE (organization_id, id)` e quatro FKs compostos tenant-aware, sem triggers de usuário diretamente nas quatro tabelas. RLS está ligado com policies tenant-aware para `authenticated`, mas `service_role` mantém DML efetivo e bypassa RLS; não há escrita explícita nas quatro tabelas no código local além do reader, sugerindo que escritas passam pelas RPCs/triggers do caminho `legacy_records`. Essa cadeia privilegiada precisa de auditoria e teste negativo; até então a integridade cross-tenant é lacuna P0 antes de backfill/cutover.
- Aceite: commit/artefatos identificados, nenhum processo paralelo alterando o mesmo ambiente e snapshot de catálogo/grants com timestamp e proveniência.

### Evidência read-only atualizada de produção — 30/09/2026

- No projeto `fwpisypiiezjhtqxlmqv`, em transações `BEGIN READ ONLY`, as quatro tabelas `maestro_clients`, `maestro_projects`, `maestro_jobs` e `maestro_job_tasks` existem. O catálogo exibiu FKs simples `job_id → maestro_jobs(id)`, `client_id → maestro_clients(id)` e `project_id → maestro_projects(id)`, além das FKs de `organization_id → organizations(id)`; as uniques presentes usam `(organization_id, legacy_record_id)`. Não apareceram as sete constraints esperadas pelo candidate: três uniques `(organization_id,id)` e quatro FKs compostos que vinculam os registros pelo mesmo tenant.
- Isto prova diferença de catálogo e ausência daqueles efeitos compostos; a busca read-only também encontrou zero triggers de usuário ligados diretamente às quatro tabelas. Ainda não prova que uma escrita cross-tenant seja explorável, pois RPCs, Edge Functions e triggers no caminho legado não foram integralmente auditados. Até a equivalência e o teste negativo serem provados, a integridade relacional cross-tenant dessas relações não pode ser considerada concluída.
- `has_table_privilege` confirmou em `legacy_records`: `anon` e `authenticated` sem `SELECT`, `INSERT`, `UPDATE`, `DELETE` ou `TRUNCATE`; `service_role` com os cinco privilégios. A tabela permanece protegida dos roles cliente nesta medição, mas o privilégio efetivo de `TRUNCATE` da service role e os grants/policies/defaults das demais tabelas ainda entram na auditoria de escopo server-side.
- Nas quatro relações core, RLS está habilitado sem FORCE, com quatro policies cada: policies `authenticated` exigem membership ativa na organização da linha e DELETE limita papel a `master`/`gestor`. `service_role` tem DML efetivo; o isolamento para esse caminho não é dado por RLS e não pode ser inferido da prova de policies.
- As consultas foram somente leitura. Nenhum DDL, grant, dado, ledger, migration ou configuração remota foi alterado. A reprodução da query no clone de produção, incluindo versão PostgreSQL, comparação dos guards e negativa de relação cross-tenant, é o próximo teste; não promover migrations até lá.

### Exercício da RPC core sob `service_role` — 30/09/2026

- A suíte SQL de isolamento passou a executar `maestro_write_frozen_core_with_history` sob `service_role`, que ignora RLS: tentativas de criar Job com projeto de outro tenant e Subtask ligada a Job de outro tenant são rejeitadas; as gravações válidas mantêm os FKs tenant-aware e os dois eventos de histórico.
- O script completo `scripts/sql/tenant-isolation-ci.test.sql` passou no clean-room ativo e terminou em `ROLLBACK`; não permaneceram fixtures nem grants. Esse clone tinha 171/172 migrations locais aplicadas; a única ausente é `20260930160000_reinforce_cxm_silence_due_tenant_scope`, exclusivamente CXM e sem referências no teste. Portanto esta execução comprova o contrato isolado da RPC, não o replay integral desta revisão.
- A primeira versão do teste detectou que a consulta de validação de histórico não deve ocorrer sob `service_role`, que não precisa de `SELECT` nessa relação. A asserção foi movida para depois de `RESET ROLE`, sem ampliar privilégios; uma segunda contagem constatou corretamente dois eventos (Job e Subtask), e o teste final passou.
- Essa prova valida a definição local da RPC e o comportamento no clone, mas não confirma que Produção tenha a mesma definição/grants nem substitui as sete constraints tenant-aware ausentes no catálogo de 30/09. Repetir contra clones completos dos perfis atuais e conferir o catálogo remoto read-only segue P0; nenhum deploy/DDL remoto foi feito.

### Referências cruzadas no trigger legado core — 30/09/2026

- Um ensaio reproduzível no clean-room mostrou que uma inserção `legacy_records` de um `Project` do tenant A com `client_id` existente somente no tenant B era aceita pelo trigger e projetava `client_id = NULL`, mantendo `client_legacy_record_id` apontando para B. A FK composta `(organization_id, client_id, client_legacy_record_id)` não bloqueia esse caso porque um componente da chave é nulo (`MATCH SIMPLE`). A transação de prova foi revertida.
- Adicionei a migration aditiva não-CXM `20260930170000_reject_cross_tenant_core_projection_references.sql`: o trigger agora rejeita referências Client/Project que resolvam exclusivamente em outro tenant para Projects e Jobs, mantendo referências históricas sem correspondência global como snapshots legados. A migration não transforma nem apaga registros já existentes.
- A suíte SQL exercita tentativas negativas para Project→Client, Job→Client e Job→Project, além do caso unresolved permitido. Migration e suíte passaram juntas numa única transação temporária contra o clean-room; o `ROLLBACK` final desfez também o `CREATE OR REPLACE FUNCTION`. Reconsulta confirmou o corpo antigo restaurado e 171 entradas no ledger, sem alteração persistente.
- O CI `36784721927` passou após este ensaio: replay limpo das 173 migrations, lint do schema, teste atualizado de isolamento, verificações de autorização/inventário, Semgrep, dependências e secrets. Antes de propor qualquer promoção, auditar leitores/writers legados e classificar referências historicamente cross-tenant; Produção segue sem alteração e as FKs compostas continuam pendentes.
- Para preparar essa triagem, criei `scripts/sql/audit_core_tenant_integrity.sql`: em transação `READ ONLY`, agrega FKs tipadas fora do tenant, divergências UUID/ID legado, IDs legados same-tenant sem UUID, referências resolvidas apenas em outro tenant e órfãos; também relata as sete constraints esperadas e o estado de RLS, sem retornar identificadores nem payloads. No clean-room vazio a consulta confirmou `transaction_read_only=on`, zero referências e as sete constraints presentes/validadas; esse resultado é apenas estrutural, não substitui os dados de Produção. O SQL foi adicionado ao job de replay/isolamento do CI; execução remota segue pendente.

### P1 — reconciliar histórico e efeitos reais das migrations

- Completar a matriz das 173 migrations locais versus Dev, produção e branch Supabase de validação; o relatório atual é fingerprint/identidade, não classificação completa de efeitos. Inspecionar SQL local e catálogo atual, mapear dependências, consumidores, funções, triggers, cron e secrets sem expor payloads/credenciais.
- Resolver todos os casos `SQL divergente`, conteúdo local/remoto sem par e aliases; classificar cada efeito como equivalente, pendente, conflito, CXM ou operacional. CXM e jobs relacionados ficam fora da sequência não-CXM.
- Definir a sequência mínima de migrations não-CXM com manifest explícito e dependências; não “consertar” o ledger para fazê-lo coincidir.
- Aceite: 100% dos itens da sequência proposta têm evidência de estado esperado e ordem; nenhum efeito não explicado. Até lá, sem upgrade remoto.

### P2 — provar upgrades em clones representativos e fechar segurança multi-tenant

- Criar clones descartáveis separados para representar os catálogos divergentes de Dev e produção, com dados anonimizados/sintéticos e sem conexão de escrita com os ambientes de origem.
- Aplicar neles a sequência reconciliada; validar catálogo, constraints, índices, policies, owners/grants, funções e schedulers. Reexecutar os scripts para provar idempotência somente quando migration declarar esse comportamento.
- Ampliar allow/deny para todas as Edge Functions/RPCs/views e casos de organização errada, role insuficiente e entitlement ausente; conferir grants padrão de todos os owners. Priorizar o caminho `service_role`/`legacy_records` e endpoints compartilhados.
- Aceite: upgrade dos dois perfis termina sem reparo manual do ledger, replay e catálogo são reproduzíveis, e nenhum acesso cross-tenant/produto não autorizado passa.

### P3 — provar dados, payloads e fluxos relacionais de ponta a ponta

- Revalidar no snapshot a qualidade do dado (incluindo os casos históricos reportados de Jobs sem referência e subtarefas órfãs); classificar exceções sem inferir vínculos por título. Medir IDs, contagens, relações e payloads antes/depois; backfill repetível e retomável.
- Para as 21 entidades do reader, testar consultas PostgREST reais com paginação, ordenação, cada filtro suportado e fallback; comparar resultado relacional versus legado por tenant, inclusive sem dados e valores nulos. Cobrir as colunas JSON explicitamente verificadas pelo gate estático.
- Completar e provar contratos de escrita/exclusão/auditoria; a presença do leitor em dark launch não equivale a cutover nem fonte de verdade relacional.
- Aceite: paridade bidirecional explicada e fluxos críticos UI/API passam em duas organizações; nenhuma exceção desaparece nem se duplica.

### P4 — cortar o Maestro gradualmente por domínio, com rollback exercitado

- Executar uma fatia por vez, nesta ordem: (1) Client/Project/Job/tarefas; (2) comentários/histórico/anexos/aprovações; (3) Financeiro; (4) agenda/timesheets/notificações; (5) documentos/templates/IA/operacional; (6) Ads Brain/Insights.
- Em cada fatia: backfill → comparação → dual-write se necessário → leitura relacional controlada em homologação → observação → congelar legado apenas daquela fatia → ensaiar rollback. Não remover `legacy_records` até todas as entidades e consumidores estarem aposentados com evidência.
- Aceite por fatia: paridade sem divergência inexplicada, autorização e regressão aprovadas, rollback recupera a imagem anterior e os outros domínios não mudam.

### P5 — tornar releases não-CXM realmente segregados

- Resolver os seis Edge Functions compartilhados e oito pendentes não-CXM do manifesto atual; mapear acessos dinâmicos a `legacy_records`, credenciais WhatsApp globais, cron e dependências implícitas. Não classificar como seguro só pela ausência de texto `CXM`.
- Definir allowlist de funções, migrations, secrets, schedulers e módulos não-CXM; automatizar CI para falhar se uma função/migration proibida entrar no pacote. O atual `release_ready=false` é um bloqueio real.
- Aceite: artefato reproduzível de deploy não-CXM e teste provando que CXM e seus workers não são publicados nem necessários ao Maestro.

### P6 — construir e comprovar CXM independente em trilha isolada

- O spike Deskcomm comprova serviços/banco e infraestrutura local, não a aplicação CXM. Localizar/consolidar o código CXM executável e seu schema/migrations próprios (ou iniciar pacote standalone versionado); definir identidade/tenancy, APIs, secrets, Storage, filas, cron, auditoria e operação.
- Formalizar integração opcional por contrato versionado, IDs externos, autenticação, idempotência, retries/DLQ e desconexão; sem FK entre bancos. Provar instalação limpa, upgrade, fluxos essenciais e isolamento com duas organizações sem Maestro conectado.
- Aceite: deploy, login, CRUD/fluxos CXM e recuperação funcionam no stack próprio; integração pode cair/reconectar sem bloquear o Maestro ou duplicar dados.

### P7 — recuperação, carga e lançamento gradual

- Ensaiar backup/restore completo de cada produto separadamente, incluindo Auth, Storage, roles, configuração/secrets pelo processo seguro e schedulers; definir e medir RPO/RTO. O round-trip atual prova somente schema/dados Postgres do clean-room.
- Medir carga representativa, índices/queries, filas e limites por tenant; preparar alertas, feature flags e rollback operacional.
- Fazer homologação integrada do Maestro e CXM (standalone e conectado); liberar por domínio/tenant com observação e interruptor de rollback. Produção só após todos os gates anteriores e aprovação do usuário para o corte específico.

### Paralelismo permitido sem conflito

- **Trilha A — migrations/catálogos:** P1 e preparação de clones P2, exclusivamente read-only até existir sequência aprovada.
- **Trilha B — runtime Maestro:** testes reais do dispatcher, contratos e exceções P3 em banco descartável, sem habilitar flags de produção nem editar os artefatos da Trilha A.
- **Trilha C — CXM:** localizar/estruturar aplicação e contrato standalone P6 em branch/repositório isolado; não compartilhar migrations, secrets ou deploy com Maestro.
- P4 depende dos resultados A+B; P5 pode avançar em paralelo em manifesto/pipeline isolado, mas release permanece bloqueado; P7 e lançamento dependem das duas trilhas de produto e dos gates de segurança.

**Próxima atividade concreta:** começar pela P1, fechando a classificação dos efeitos divergentes e dos conteúdos sem par nos catálogos, sem alterar banco remoto. Em paralelo, iniciar apenas o inventário de runtime standalone CXM e os casos de consulta PostgREST em clones descartáveis.

## O que não fazer

- Não executar `db push` do diretório inteiro, não reconciliar ledger apenas com inserções manuais e não reescrever versões aplicadas.
- Não aplicar alterações em produção enquanto branch de validação e histórico não forem reprodutíveis.
- Não apagar `legacy_records`, dados órfãos, snapshots ou tabelas CXM como parte deste plano sem uma etapa própria de exportação, backup e decisão aprovada.
- Não compartilhar banco entre produtos como requisito de integração: podem compartilhar infraestrutura inicialmente, mas os limites precisam permitir implantação e evolução independentes.
- 29/09: fechada uma lacuna no contrato de exclusão financeira: o snapshot de recuperação (`DeleteLog`), auditoria, exclusão do registro legado e remoção da projeção agora são atômicos na RPC; a interface deixa de criar o snapshot em chamada separada. Prova rollback-only passou no clean-room (replay anterior + migration aplicada isoladamente) e em branch Supabase isolada sem dados. Esta correção ainda não foi promovida a Produção.

### Isolamento tenant do snapshot MMM/Insights — 30/09/2026

- A Edge Function `marketing-mix-snapshot` recebia `client_id` assinado pelo serviço MMM, mas consultava observações somente por esse ID, sem usar o `organization_id` já persistido. Agora resolve o cliente por vínculo legado `Client` confirmado e organização ativa; exige vínculo único (zero ou múltiplas organizações falham fechadas), entitlement `insights` em `trial`/`enabled` e filtra as observações pelo mesmo tenant.
- Regressão no CI Node valida a ordem das verificações e todos os filtros. Suíte local: 36/36; bundling/sintaxe da Edge Function com esbuild passou; verificador de fronteira continua sem erros, mas corretamente reporta `release_ready=false` (função ainda pendente junto aos outros bloqueios). CI `36767469573` passou integralmente, incluindo replay clean-room, lint do schema público e isolamento SQL.
- Não alterei o cliente MMM, o protocolo HMAC, schema, secrets ou dados remotos. Ainda faltam prova ponta a ponta do serviço até o snapshot, catálogo/entitlement real em ambientes representativos e validação operacional antes de reclassificar a função ou incluí-la num release.

### Validade temporal dos entitlements — 30/09/2026

- A função compartilhada `hasActiveOrganizationProduct` agora considera `expires_at`: datas expiradas ou inválidas negam acesso; null/ausente mantém compatibilidade com entitlements sem expiração. Os endpoints `maestro-data`, `maestro-ai`, `system-reports` e `marketing-mix-snapshot` incluem esse campo nas consultas que alimentam a autorização.
- Testes locais cobrem expiração antes/depois do instante de referência e data inválida; suíte 36/36, bundling MMM e `git diff --check` passaram. CI `36767789347` do commit `380b7850` passou integralmente, incluindo replay de migrations e SQL multi-tenant; nenhum release foi reclassificado.

### Entitlement organizacional nas rotas Ads Brain — 30/09/2026

- `traffic-copilot` e `meta-ads-oauth` já validavam membership/tenant e permissão individual, mas não exigiam o entitlement Ads Brain da organização. Ambas agora verificam `organization_products` para o tenant autenticado, incluindo `expires_at`, antes de ler/alterar contas ou avançar o fluxo OAuth.
- Regressões garantem que o gate precede as operações com contas, e que a consulta carrega `product_key`, `status` e `expires_at`. Suíte local: 36/36; bundling das duas funções e `git diff --check` passaram.
- Commit `fed621ca` enviado à branch candidata; CI `36768177137` passou integralmente, incluindo replay limpo, lint do schema, testes SQL de isolamento e análises de segurança. O manifesto mantém as funções pendentes: provar o gate não demonstra fluxo Meta ponta a ponta, revisão de release nem integração independente do CXM. Nenhuma chamada externa à Meta ou alteração remota foi feita.

### Entitlement Maestro em operações administrativas de timesheet — 30/09/2026

- `admin-timesheets` já exigia sessão válida, membership ativa no tenant e papel master, e delegava exclusão/reset a RPCs tenant-scoped. Agora também exige entitlement `maestro` ativo e não expirado, validado antes de aceitar as operações administrativas, inclusive limpeza em massa e reset.
- O acesso a `organization_products` falha fechado em erro ou entitlement ausente/expirado. Regressão adicionada ao teste do endpoint; suíte Node 36/36, bundle esbuild e `git diff --check` passaram localmente.
- Commit `a5caaa10` enviado à branch candidata; CI `36768493342` passou integralmente, com replay de migrations, lint do schema, isolamento SQL e análises de segurança. Nenhuma operação real de timesheet nem alteração remota foi executada.

### Entitlement Maestro no chat interno e administração de credenciais — 30/09/2026

- `team-chat` e `hash-collaborator-password` validam agora entitlement Maestro não expirado para a organização selecionada antes de entregar canais/mensagens ou alterar credenciais. Erro ao consultar produto falha fechado; as regras de membership e escopo já existentes permanecem.
- Testes de regressão verificam a consulta por organização, inclusão de `expires_at` e precedência do gate sobre as operações protegidas. Suíte Node local 36/36, bundles das Edge Functions e `git diff --check` passaram.
- Commit `a391dc1e` enviado à branch candidata; CI `36768766356` passou integralmente, incluindo replay clean-room, lint, isolamento SQL e análises de segurança. Nenhum conteúdo de chat ou credencial foi lido/alterado em ambiente remoto.

### Entitlement Maestro na aprovação pública de Jobs — 30/09/2026

- A rota de aprovação pública mantém o token assinado e o tenant obtido do Job, mas agora exige também entitlement Maestro vigente para essa organização antes de carregar o Job/attachments ou executar aprovação, feedback, histórico e notificação.
- Regressão assegura a consulta de `organization_products` no tenant resolvido, incluindo `expires_at`, e que o gate precede a ação `load`. Suíte Node local 36/36, bundle esbuild e `git diff --check` passaram.
- Commit `41444174` enviado à branch candidata; CI `36768960135` passou integralmente, incluindo replay clean-room, lint, isolamento SQL e análises de segurança. Nenhum link real ou estado remoto foi alterado.

### Classificação fail-closed de entidades e dashboard — 30/09/2026

- Auditoria do dispatcher mostrou que qualquer nome de entidade era aceito; a verificação de produto só ocorria quando o registry/fallback reconhecia a entidade, portanto entidades sem classificação passavam sem gate. A operação especial `dashboard` também retornava antes de qualquer entitlement.
- O fallback agora classifica os 32 tipos usados por `maestro.entities.*`: entidades operacionais do Maestro, CXM (Proposta) e Insights (NPS e insights/concorrentes/posts). `legacy_cutover_registry.module_key` continua tendo precedência, divergência entre registry e fallback nega acesso; entidades desconhecidas/sem classificação são negadas. Todos os entitlements, inclusive Maestro, exigem status `trial`/`enabled` e não expirado. Dashboard verifica Maestro explicitamente antes de ler dados.
- Testes cobrem correspondência do inventário de entidades, negação de desconhecidas, necessidade de entitlement Maestro e gate do dashboard. Suíte local 37/37; bundling da função e verificador de fronteira passaram; manifesto continua `release_ready=false` pelos outros bloqueios. A execução CI `36769746816` havia falhado apenas no Trivy por sete alertas HIGH no Axios 1.18.1, dependência transitiva do SDK legado Base44; correção e validação constam na seção de remediação abaixo. Nenhum ambiente remoto mudou.

### Remediação de dependência e CI — 30/09/2026

- O scanner do CI `36769746816` identificou Axios 1.18.1 transitivo de `@base44/sdk`; o release oficial do Axios documenta a versão 1.20.0 e a atualização foi aplicada por override, preservando o SDK legado até que o caminho funcional de autenticação seja removido com substituição comprovada.
- Verificação local: `npm ls axios` resolve exclusivamente Axios 1.20.0; `npm audit` não reporta vulnerabilidade Axios; a suíte Node atual passou 37/37; build Vite passou; verificador de fronteira passou. O lint geral continua falhando por 85 imports não usados preexistentes distribuídos no aplicativo, sem alterações nessa rodada.
- Commit `aa6415e2` enviado à branch candidata. CI `36770357435` concluiu com sucesso em todos os jobs: replay clean-room das migrations, testes de autorização/regressão, análise estática, scan de segredos, scan de dependências e configuração de container.
- Após o CI verde, `npm audit fix` aplicou apenas atualizações dentro das faixas compatíveis já permitidas, inclusive Vite 6.4.3 e Rollup 4.63.5. Revalidação local: build passou, suíte Node 37/37, verificador de fronteira passou e `git diff --check` limpo. Restam somente dois alertas moderate em `react-router`/`react-router-dom`; a correção sugerida pelo npm exige React Router 7.18.4, major incompatível com a faixa 6.x atual, então foi deliberadamente deixada para migração e testes próprios. CI `36772556678` passou integralmente para o commit `a9f1d225`, incluindo replay limpo, lint de schema, testes/regressões, Semgrep, Trivy, scan de segredos e configuração de container.
- A correção do Axios removeu o bloqueio Trivy do commit anterior e atualizações compatíveis reduziram os alertas da auditoria npm de 15 para 2 moderate; isso não demonstra ausência universal de vulnerabilidades nem fecha a fronteira de produto. A árvore de funções continua com seis compartilhadas e oito pendentes; `release_ready=false`. Não houve deploy ou alteração de banco remoto.
- Estimativa geral permanece **40%**: o CI verde fecha uma regressão pontual de segurança/integração, não fecha critérios de fases nem reduz o gate de acoplamento.

### Integridade dos verificadores no branch candidato — 30/09/2026

- Auditoria do commit `f2d06ea2`: o `package.json` mantém oito comandos `verify:*` apontando para `scripts/verify-*.mjs` que não existem no tree rastreado deste branch (`relational-parity`, `tenant-foundation`, `product-modules`, `legacy-cutover`, `tenant-isolation`, `relational-dispatch`, `migration-files`, `functional-inventory`). Assim, esses comandos falham com módulo/arquivo ausente neste checkout e não são reprodutíveis pelo branch candidato.
- O checkout principal contém cópias desses verificadores e dependências como arquivos não rastreados, junto com muitas outras alterações locais do usuário. Para preservar esse trabalho e evitar misturar estados, não foram copiados nem executados aqui. A execução CI `36772896365` confirma apenas os gates efetivamente incluídos no branch (replay clean-room, SQL RLS/tenant-aware, testes de código presentes, scanners); suas anotações declaram explicitamente que inventário funcional, auditor de migrations e fontes app foram omitidos do candidato.
- Isso não invalida os resultados históricos registrados para o checkout em que foram executados, mas reduz sua reprodutibilidade no branch que se pretende promover. Antes de alegar gates reproduzíveis, versionar um conjunto curado desses auditores/testes e suas configurações, separando scripts somente leitura de comandos com potencial de escrita; validar que os read-only apontam exclusivamente para banco descartável.
- A estimativa permanece **40%** e `release_ready=false`; este achado reforça a pendência de empacotamento/validação e não autoriza qualquer operação remota.

### Reprodutibilidade dos auditores e divergência do dispatcher — 30/09/2026

- Para recuperar a capacidade de auditoria no worktree isolado, foram trazidos para ele os verificadores estáticos/de banco declarados no `package.json`, seus módulos auxiliares/configurações e o mapa funcional (27 arquivos), sem alterar o checkout principal.
- O branch candidato agora passa `verify:migration-files` (172 migrations), `verify:relational-dispatch` (21/21 entidades, tabelas presentes nas migrations e mapas de colunas compatíveis com o schema versionado) e `verify:functional-inventory` (20 rotas, 32 entidades explícitas, 119 operações, sem lacunas). O mapa separa corretamente as rotas protegidas e preserva disposições CXM/externas como backlog fora do frontend ativo, sem tratá-las como CXM standalone já entregue.
- A leitura relacional está implementada em dark launch: o frontend só a solicita para entidades presentes em `VITE_MAESTRO_RELATIONAL_READS`; o servidor exige `organization_id`, traduz filtros apenas para colunas verificadas e cai para legacy quando não suporta o filtro/ordenação, reportando a origem efetiva. A variável não foi habilitada em produção; não há prova de paridade/runtime por tenant nem de corte de fonte.
- `verify:edge-function-product-boundaries` segue estruturalmente correto, mas com 14 bloqueios (seis compartilhadas e oito não-CXM pendentes). O checkout principal separado ainda contém outro trabalho local não rastreado, preservado sem alteração; não foi copiado como conjunto, nem usado como prova de entrega.
- Suíte compartilhada/lib atual: 74/74; build Vite, verificação de sintaxe TypeScript, replay CI das migrations (na execução anterior) e `git diff --check` passam. A CI do commit do dispatcher atômico identificou a lacuna relacional então existente; a versão atual ainda precisa de nova CI. Nenhum verificador com `SUPABASE_TEST_DB_URL` ou projeto/ref descartável foi executado, e não houve escrita remota.
- A estimativa geral permanece **40%**: o dispatcher e a auditoria ficaram reproduzíveis, mas não se demonstrou comportamento funcional contra dados, paridade de leitura/escrita, cutover, release segregado ou CXM independente. Os gates continuam fechados.

### Transferência de subtarefas migrada para RPC relacional — 30/09/2026

- O handler `transferSubtasks` agora valida os IDs recebidos e chama `maestro_transfer_subtasks` com a organização e o ator derivados da sessão; removeu o caminho que atualizava apenas `legacy_records`. A migration já existente executa a transferência e o histórico numa transação, valida membership/colaborador de destino e bloqueia tarefas concluídas.
- O contrato estático foi ajustado para localizar o handler no layout real deste branch, com teste de regressão para rejeitar upsert legado. A transferência é autorizada apenas após a checagem de papel já existente e usa a organização/ator da sessão validada.
- Em sequência, o dispatcher de leitura das 21 entidades foi incorporado no mesmo endpoint com seleção opt-in e fallback/telemetria de origem. Continua sem ativação em produção e sem prova transacional contra banco de teste; não foi feito deploy. Estimativa geral permanece **40%**.

### Integridade do contrato de payload do leitor relacional — 30/09/2026

- A revisão do gate encontrou uma lacuna: ele conferia tabelas e colunas de filtro/ordenação das 21 entidades, mas não a coluna JSON selecionada para reconstruir o payload. O dispatcher agora declara explicitamente `payloadColumnByEntity`; entidade sem mapeamento falha para fallback legado.
- `verify:relational-dispatch` agora valida, para cada entidade opt-in, que a coluna de payload consta nas migrations e tem tipo `json`/`jsonb`. Resultado local: 21 entidades, 21 tabelas, 21 mapas de campos e 21 mapas de payload aprovados.
- Provas desta rodada: suíte Node compartilhada/lib 74/74, build Vite, `verify:migration-files` (172 migrations), `verify:relational-dispatch` e `git diff --check` passaram. Essa validação estática não substitui query real PostgREST, comparação de payload por tenant ou E2E; mudança ainda não tem CI própria.
- Nenhuma flag foi habilitada, deploy ou escrita remota ocorreu. O percentual permanece **40%** até haver evidência de runtime/paridade e progresso nos gates de reconciliação, cutover e CXM standalone.

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
- Atualização da décima fatia: commit `62fed87e` enviado; CI `36760264880` passou integralmente, incluindo replay de migrations, isolamento SQL, testes, Semgrep, Trivy e secret scan.
- Correção factual do inventário: ao executar a branch candidata em 30/09, o gate original aceitava entradas pendentes sem diretório correspondente. O manifesto tinha nove nomes obsoletos, incluindo duas funções CXM ausentes; a árvore real contém 18 Edge Functions. O verificador agora rejeita pendências inexistentes e funções explicitamente excluídas que reapareçam na árvore; o manifesto registra `cxm-data` e `cxm-deskcomm-sso` como exclusões deliberadas, não como pendências. Estado verificado: 18 funções atuais, 3 candidatas, 6 bloqueadas por acoplamento compartilhado e 8 pendentes não-CXM; `release_ready=false`. Suíte Node 31/31, verificador e `git diff --check` passaram. Os snapshots anteriores de 27 funções representam o inventário daquela revisão, não a árvore atual. O CI desta correção ainda precisa passar; nenhum deploy foi feito.
- Validação CI da correção de inventário: commit `5013fa3a`; workflow `36761496207` passou, incluindo testes/regressão, replay clean-room, SQL de isolamento, Semgrep, Trivy e secret scan.
- Nova reconciliação read-only dos ledgers (30/09; branch candidata, 172 arquivos): Dev possui 83 entradas e Produção 111. Fingerprints de statements indicam Dev: 22 pares idênticos versão/nome e SQL, 9 pares exatos com SQL diferente, 47 mesmos nomes em outras versões com SQL igual, 4 com SQL diferente, 90 conteúdos locais sem equivalente remoto e 14 conteúdos remotos sem equivalente local. Produção: 16, 1, 74, 9, 62 e 11, respectivamente; há ainda 10 aliases de conteúdo local em outras identidades/versionamentos. Refs verificadas e transações `READ ONLY`; nenhum ledger foi alterado. O inventário completo por identidade está em `docs/migration-drift-reconciliation.md`.
- Cruzamento pontual do catálogo: `whatsapp_automation_runner` está ativo nos dois projetos (`*/5 * * * *`) com fingerprints de comando distintos; `cxm_webhook_queue_runner` está ativo só em Dev (`* * * * *`). Dev contém overloads CXM de enqueue de 3 e 4 argumentos, `SECURITY DEFINER`, `search_path` vazio, `EXECUTE` efetivo apenas a `service_role`; Produção não contém a função nem o cron CXM. Logo, diferenças da migration CXM refletem também implantação de produto desigual, não apenas drift inerte. A análise não leu texto de comandos do cron nem alterou dados/configuração.
- Interpretação operacional: o fingerprint do ledger não prova igualdade do catálogo efetivo; os pares com conteúdo diferente e todo conteúdo não representado exigem comparação de statements/catálogo e procedência do deploy. Em particular, não fazer `migration repair` ou `db push` integral. A análise segue incompleta, o release continua não elegível e CXM deve permanecer fora do pacote não-CXM.

### Gate de entitlement por produto para entidades classificadas — 30/09/2026

- `maestro-data` agora consulta a classificação de domínio (`legacy_cutover_registry` com fallback canônico para os seis registros não-Maestro sem entrada no Dev) e exige entitlement ativo na organização da sessão antes do CRUD genérico; entidades desconhecidas e classificações conflitantes falham fechadas. `maestro-ai` também exige acesso CXM antes de consultar propostas comerciais. Isso fecha o acesso desses dois caminhos de backend, não todas as rotas/telas nem todos os endpoints com `service_role`.
- Regressões verificadas: fallback alinhado exatamente às sementes não-Maestro da migration registry; checagens de entitlement nos dispatchers; suíte Node local 35/35. Verificador atual da fronteira: 18 funções classificadas, 3 candidatas, 6 compartilhadas bloqueadas, 8 pendentes não-CXM, `release_ready=false`, sem erros de inventário.
- CI do commit `a5d1efc1` — workflow `36766742007` — concluiu com sucesso: testes/autorização, inventário da fronteira, verificações de dependências e segurança, replay das migrations em banco limpo, lint do schema público e isolamento RLS/FKs tenant-aware.
- Não houve deploy nem alteração nos bancos remotos. Permanecem pendentes o gate de release (6 funções compartilhadas + 8 não-CXM), entidades fora do registry/fallback e visibilidade de UI/rotas por produto; este controle não demonstra CXM standalone nem encerra as fases de reconciliação, cutover, recuperação ou lançamento.
