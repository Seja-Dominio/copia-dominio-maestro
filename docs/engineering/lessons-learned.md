# Lições de engenharia

## Fixtures com DDL em dump schema-only precisam do owner restaurado — 01/10/2026

- **Evidência:** a fixture de reconciliação core falhou no clone Prod-shaped ao executar `ALTER TABLE` como `postgres`; a consulta read-only confirmou `supabase_admin` como owner das tabelas. O fechamento da sessão reverteu a fixture (0 organizações, Jobs, tasks/exceções sintéticas). Reexecução idêntica como `supabase_admin` passou migrations idempotentes, asserts de reconciliação/recovery e RLS, finalizando com `ROLLBACK` e zero resíduos. O CI clean-room continuou passando como `postgres`, cujo ownership é diferente.
- **Aplicação:** em snapshots `pg_dump --schema-only`, conferir owner antes de executar fixtures com DDL; usar o owner do clone para preparar/aplicar DDL e `SET ROLE` explícito para validar privilégios de runtime.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, com esta separação entre owner do clone e papel executor da aplicação.
- Esforço ativo: não medido; CI/espera separados.

## Preview saudável sem dados não valida upgrade representativo — 01/10/2026

- **Evidência:** duas branches preview Supabase acessíveis (`xpyvjchcrnvprvwgjibm` e `fwvpfmbkuosjibvyvbap`) reportam `ACTIVE_HEALTHY`, mas `with_data=false` e `MIGRATIONS_FAILED`. Consultas PostgreSQL `READ ONLY` confirmaram catálogo core e sete constraints tenant-aware, enquanto o projeto pai Produção não tem essas sete constraints; o Dev pai tem. A branch non-CXM consultada nem contém as quatro relações core.
- **Conclusão:** branch operacionalmente saudável pode servir para inspecionar catálogo, mas não para afirmar replay de migrations, upgrade do estado pai, backfill ou integridade de dados. Catálogo idêntico não substitui dados/ledger representativos.
- **Aplicação:** registrar estado de migrations, `with_data` e paridade do catálogo ao selecionar um preview; classificar explicitamente que tipo de prova ele suporta.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, com a ressalva para branches preview sem dados e com migrations falhas.
- Esforço ativo: não medido; esperas de CI foram separadas.

## Fixtures SQL enviadas a containers precisam injetar migrations no host — 01/10/2026

- **Evidência:** o CI executou um fixture via `docker exec -i ... psql < fixture.sql`; `\ir` falhou porque o checkout não está montado dentro do container (`36923194419`). A barreira/concatenação host-side fez o teste de ausência de configuração passar (`36925492604`). O teste do caminho configurado revelou uma expectativa errada de URL contígua: o comando cron guarda a origem literal e concatena o caminho como expressão SQL (`36925709878`).
- **Correção validada:** o runner injeta fixture + migration + assertions numa sessão; assertions verificam origem e caminho separadamente. CI `36926128097` passou integralmente, incluindo configuração ausente e presente, com `ROLLBACK` das fixtures.
- **Aplicação:** testes que intercalam migrations via `docker exec` usam barreiras e concatenação no host; ao inspecionar comandos SQL gerados por `format`, validar a forma armazenada da expressão sem confundi-la com o valor resolvido em runtime.
- Esforço ativo: não medido; CI/espera foram separados do esforço ativo.

## Ledger divergente exige preflight de coluna e vínculo — 01/10/2026

- **Evidência:** Dev e Produção tinham a relação `job_task_reconciliation`, mas só Produção tinha `organization_id`; por isso a migration de grants por coluna falhava em Dev embora o nome/tabela existisse. A relação Timesheet também estava ausente em Dev, bloqueando atualizações diretas e a migration core posterior. Consultas agregadas `READ ONLY` confirmaram 478/478 filas Dev com exatamente um vínculo `organization_legacy_records` por tenant e 496/496 filas Prod já corretamente escopadas.
- **Correção validada em clones locais:** a migration agora exige mapeamento unívoco antes de backfill e constraint, permite que as migrations intermediárias pulem explicitamente o reparo Timesheet ausente e deixa a migration forward final criar/validar a projeção. No clone Dev passaram o caminho de upgrade desde ausência da tabela/coluna, backfill sintético de dois tenants, event trigger Dev equivalente e rollback; no clone Prod passaram o sufixo, isolamento/RPC, RLS/policies Timesheet e auditoria tenant-aware. A suíte direta Auth/RLS no clone Dev ficou inconclusiva por grants/policies ausentes no próprio snapshot. Nenhum banco hospedado foi escrito.
- **Aplicação:** upgrades que partem de mais de um ambiente/ledger. Verificar colunas e constraints realmente consumidas em cada passo cronológico; para backfills, provar cardinalidade tenant-aware dos dados e falhar fechada para órfãos/ambiguidades; validar os caminhos Dev e Prod em clones separados.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, adicionando preflight de colunas, constraints, mapeamento e sequência completa por baseline.

## Sessão emitida precisa corresponder ao contrato dos consumidores — 01/10/2026

- **Evidência:** o app podia autenticar por JWT nativo do Supabase, enquanto as Edge Functions protegidas aceitavam apenas sessão de colaborador assinada por HMAC. A UI marcava login como válido, mas as chamadas subsequentes falhavam; consulta agregada somente leitura também confirmou zero usuários nativos `auth.users` nos ambientes verificados.
- **Correção validada localmente:** o login ativo usa o emissor HMAC já existente; perfil inclui ID canônico e o cache é rejeitado se token, `sub`, colaborador ou tenant não corresponderem. A suíte cobre sucesso, expiração, formato inválido, mismatch e o contrato emissor. Build, lint dos arquivos alterados e testes compartilhados passaram.
- **Aplicação:** mudanças de autenticação ou migrações de provedor. Testar a cadeia emissor → armazenamento/restauração → API consumidora com o tipo de token e claims que o receptor realmente valida; sucesso visual de login não é prova de sessão operacional.
- **Skill atualizada:** `dominio-integration-testing/SKILL.md`, acrescentando a checagem genérica desse contrato de autenticação. E2E em homologação ainda pendente.

## Migrations multi-relação: classificar alvos antes do pacote — 30/09/2026

- **Evidência:** a migration `20260926520000_add_authenticated_organization_rls` mistura 33 tabelas; Produção tem 33 e 132 policies, Dev tem 9 e nenhuma policy, e 12 tabelas não aparecem no registry de ownership. Busca direta em `dominus-webhook`, `dominus-audit` e migrations de operações core ligou todos os 12 a consumidores Maestro, embora AppConfig e dados conversacionais/logs ainda exijam escopos de acesso específicos. O alvo SQL não faz guarda de existência. O caso demonstra que owner de produto não determina, por si só, autorização ou tenant policy.
- **Resultado validado:** o replay integral da branch limpa passou no CI `36808101999`; isso não resolve os ledgers/objetos divergentes nos ambientes remotos. O manifesto suplementar + gate local reconciliam 21 owners do registry e 12 owners com evidência no código, falhando para alvos novos sem classificação. A regra de não mascarar baseline incompatível evita declarar reconciliação com base em guards que apenas pulam objetos ausentes.
- **Aplicação:** migrations multi-tabela, RLS e pacotes por produto; inventariar alvos, owner, presença por ambiente e dependências antes de particionar ou testar upgrade.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, com esse cruzamento obrigatório e a ressalva contra guards silenciosos. Esforço ativo: não medido.

## RPC `SECURITY INVOKER`: testar o papel executor — 01/10/2026

- **Evidência:** `resolve_job_task_reconciliation` tinha EXECUTE restrito e configuração segura, mas uma chamada sob `service_role` no clone isolado falhou por falta de privilégio nas colunas da tabela usada internamente. Em seguida, o gatilho de recuperação de Job passou no clone como administrador, mas o CI reproduziu falta de `UPDATE` sob `service_role` na tabela de exceções. Ambos os casos mostram que o teste precisa assumir o papel real do RPC/serviço, não o proprietário do banco.
- **Correção validada:** no primeiro caso, grants mínimos por coluna, leitura explícita apenas das colunas necessárias e lock transacional por item; regressão rollback-only passou para sucesso, isolamento cross-tenant, replay da resolução, privilégios mínimos e atomicidade. No segundo, grant apenas de `UPDATE(resolution_status, resolution_note, resolved_at)` e fixture que executa o RPC com `SET ROLE service_role`; clone rollback-only e CI `36914663403` passaram.
- **Aplicação:** RPCs PostgreSQL `SECURITY INVOKER` em migrations de qualquer módulo; validar com o papel real e testar permissões efetivas além do catálogo da função.
- **Skill:** `dominio-database-migrations/SKILL.md` já continha a orientação específica de chamar com o papel invoker e conceder privilégios mínimos por coluna; nenhuma alteração adicional necessária. A segunda falha/solução confirma a aplicabilidade da regra existente.

## Gate de catálogo PostgreSQL no CI precisa de runtime declarado — 01/10/2026

- **Evidência:** o workflow do banco executava `verify:rls-policy-catalog`, que importa `pg`, mas o job de migrations não instalava dependências Node; CI `36811273480` falhou com `ERR_MODULE_NOT_FOUND: pg` depois do replay limpo.
- **Correção verificada:** setup Node 22 + `npm ci --ignore-scripts` no job DB; workflow `36811508738` passou todos os jobs, incluindo replay limpo e gate RLS.
- **Aplicação:** qualquer script de CI que rode cliente PostgreSQL em Node deve declarar runtime e dependências no próprio job; sucesso no job de unit tests separado não satisfaz essa pré-condição.
- **Skill:** sem alteração; a lição é específica do workflow e ficou registrada aqui, sem necessidade de generalizar instrução procedural para todas as migrations.

## Replay limpo não substitui upgrade de baseline real — 01/10/2026

- **Evidência:** replay limpo passou, mas clone estruturalmente idêntico ao catálogo de Prod falhou na suíte de upgrade: FKs simples permitiam vínculos cross-tenant e `service_role` mantinha ACL amplo na fila, apesar da migration de grants por coluna. Correção validada no clone com replay das oito migrations não-CXM posteriores ao ledger + migration forward corretiva; suíte transacional tenant-aware e catálogo RLS passaram.
- **Débito observado:** o preflight remoto agregado encontrou 29 IDs de responsável sem membership no mesmo tenant. A nova FK fica `NOT VALID` até conciliação; nada foi corrigido em Prod.
- **Regra promovida:** antes de confiar num clone upgradeável, compare o catálogo com a origem; quando o ledger divergir, compare o estado real e execute os contratos sobre o baseline real. Não conclua integridade a partir do replay limpo.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, exigindo baseline schema-only com paridade de catálogo e distinção entre versão do ledger e estado efetivo. Evidência de alto impacto e correção exercitada em clone isolado.

## Validar backfill histórico e função final de dual-write separadamente — 01/10/2026

- **Evidência:** fixture rollback-only reproduziu o parser defeituoso na migration inicial; depois, inspeção live `READ ONLY` confirmou que Produção ainda usa esse trigger antigo (fallback single-org/`search_path=public`) e tem 8.938 projeções nulas recuperáveis.
- **Correção/limite:** migration forward aditiva testada em clones schema-only Dev sem a tabela e Prod sem as chaves compostas, com backfill e dual-write isolados por tenant. Nenhum banco hospedado foi alterado.
- **Aplicação:** para backfills e dual-writes evolutivos, testar (1) conversão de linhas históricas; (2) definição efetiva final do trigger após toda a sequência; (3) novos inserts/updates; não extrapolar bug de migration intermediária para a função final.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, acrescentando esses três alvos de validação para parsing/backfills multi-etapa.

## Validação de entrada não torna um cast seguro em `AND` — 01/10/2026

- **Evidência:** o fixture da migration forward mostrou que `pg_input_is_valid(text, 'integer') AND text::integer` ainda pode avaliar o cast fora de faixa por reordenação do plano SQL; `2147483648` abortou a transação apesar do predicado de validação.
- **Correção validada:** o dual-write agora faz parsing sequencial em ramos PL/pgSQL, com faixa numérica limitada antes do cast; backfill usa regex limitada, conversão a numeric e só então int. Fixtures de overflow, timestamp/boolean inválidos, replay duas vezes em clones Prod/Dev e CI `36818110977` passaram.
- **Aplicação:** em SQL/PLpgSQL, não proteja casts inseguros com condição `AND`/`WHERE` que valide e converta o mesmo texto. Coloque o cast em ramo procedural após validação, ou use transformação cuja faixa seja segura por construção; mantenha testes de inválido e overflow.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`; regra pequena, reutilizável e sustentada por falha reproduzida com correção validada.

## Ausência de telemetria de função não prova RPC sem consumidores — 01/10/2026

- **Evidência:** a busca no checkout atual não encontrou chamada às RPCs `maestro_apply_legacy_mutation` e `maestro_apply_legacy_mutation_scoped`; o endpoint corrente `maestro-data` usa upsert tenant-scoped e os testes de contrato/integração desse caminho passaram. `track_functions=none` nos dois ambientes, mas `pg_stat_statements` está ativo com tracking `top`, reset anterior à migration e `dealloc=0`. Desde o reset, a consulta direta à RPC registra 3 chamadas como role `postgres` em Dev e nenhuma em Produção; não há chamada registrada como `service_role`. A estatística não atribui as chamadas `postgres` a um consumidor, e versões implantadas/externas ainda não foram inventariadas.
- **Classificação:** não há evidência de invocação da RPC pelo papel do caminho ativo Edge→service_role na janela observável, mas isso não prova que todos os consumidores antigos/externos estejam ausentes nem explica as três chamadas administrativas em Dev.
- **Aplicação:** auditorias que proponham `DROP FUNCTION`, `REVOKE` ou remoção de compatibilidade por falta de referências. Combine busca de código, consumidores implantados e estatística top-level por papel; cheque resets/evicções e mantenha o uso como desconhecido onde a cobertura não for comprovada.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, com leitura cautelosa de `pg_stat_user_functions` e alternativa condicionada via `pg_stat_statements`.
- Esforço ativo: não medido.

## Executar fixtures SQL com barreira de migration — 01/10/2026

- **Evidência:** `reconcile-core-subtask-links-clone.test.sql` declara `MIGRATION_BARRIER`; executá-lo sozinho no clone falhou na primeira assertion pós-upgrade porque a migration ainda não tinha sido injetada. Inserir `20261001140000` e `20261001150000` no marcador permitiu que as assertions de relink same-tenant, isolamento, exceptions e recovery passassem com rollback. O workflow de CI já orquestra outros dois fixtures com o mesmo padrão.
- **Aplicação:** antes de rodar fixture SQL de upgrade diretamente, procurar marcadores de barreira e revisar o workflow/orquestrador para inserir as migrations no ponto correto; preservar a ordem e o rollback do cenário.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, com regra explícita para fixtures com `MIGRATION_BARRIER`. Amostra pequena, mas o contrato é explícito no próprio fixture e repetido em três cenários do CI; esforço ativo não medido.

## Snapshots Supabase podem compartilhar um container — 01/10/2026

- **Evidência:** a listagem Docker mostrava apenas dois containers locais, mas a consulta a `pg_database` revelou vários clones Dev/Prod dentro do container `maestro-clean-room.xjrrql`, incluindo `maestro_dev_upgrade_validation_20261001f` e `maestro_prod_upgrade_full_20261001d`, cujos ensaios de upgrade estavam documentados e ainda podiam ser inspecionados.
- **Erro evitado/corrigido:** uma tentativa schema-only separada falhou por limitações de `pg_cron`/Realtime; a lista incompleta de containers levou à conclusão incorreta de que não havia upgrade representativo. Os clones previamente validados permaneceram intactos.
- **Aplicação:** antes de declarar ausência de cópia/snapshot local ou criar outra, enumerar os bancos existentes dentro de cada container Postgres relevante e conferir ledger/catálogo pelo nome do banco.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, regra pequena de descoberta de baselines.
- Esforço ativo: não medido.

## Clone schema-only também precisa reproduzir ACL efetiva — 01/10/2026

- **Evidência:** o clone Dev não tinha grants em três tabelas usadas pelo fluxo de recuperação e tinha grants incompletos em outra; por isso a chamada sob `service_role` falhou. Consulta hospedada `READ ONLY` mostrou o mesmo ACL direto amplo para `service_role` nas quatro tabelas em Dev e Produção. Ao normalizar somente o clone para esse ACL, a fixture passou tanto nele quanto no Prod-shaped.
- **Aplicação:** antes de interpretar falha de privilégio em clone como defeito de migration/runtime, comparar grants diretos e efetivos por papel, ACL por coluna, owner e defaults com o ambiente de origem; corrigir somente o clone de teste para reproduzir o estado observado.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, incluindo ACL de tabela/coluna, ownership e privilégios padrão na comparação de baselines. Não houve escrita remota.

## Interpretar contagem relacional conforme o modo de cutover — 01/10/2026

- **Evidência revisada:** a auditoria READ ONLY em Produção encontrou 7.392 linhas Subtask relacionais e 7.102 legadas; todas as chaves legadas têm projeção/escopo, mas a origem das 290 linhas relational-only permanece desconhecida. A revisão do checkout confirmou que o dispatcher anterior ignorava `write_mode`. Esta branch inclui despacho relacional fail-closed para entidades congeladas e writer scoped de Project; migration, testes tenant-aware no clone isolado e CI de replay limpo/integridade passaram. Produção não foi alterada; implantação e origem das 290 linhas não estão comprovadas.
- **Aplicação:** comparar contagem segundo modo de cutover e conferir o caminho efetivo de leitura/escrita do runtime. Uma configuração declarativa de source-of-truth não prova que o dispatcher a respeita. Preservar linhas relational-only até a origem ser comprovada; nunca forçar igualdade de totais.
- **Skill:** nenhuma alteração automática. Registra-se a evidência deste domínio; ainda não há casos comparáveis suficientes para generalizar a mudança à skill global de migrations.
- Esforço ativo: não medido.

## Separar tenant provisionado da organização-base no replay — 01/10/2026

- **Evidência:** CI `36928279142` replayou todas as migrations e falhou no gate que exigia owner para qualquer organização ativa. O rastreamento identificou `20260926290000_scope_cxm_collaboration_tables.sql` criando a organização-base da qual migrations relacionais Maestro dependem. Os CI `36928957030` e `36929567414` passaram o replay e os cenários negativo e positivo: falha/rollback sem owner; com owner, quatro produtos e escopo legado únicos mesmo após duas execuções, seguido de rollback.
- **Correção:** estreitar o contrato do teste para verificar mapeamento legado sem owner e conservar os casos sintéticos de erro/idempotência. Não apagar a organização-base nem editar a migration de colaboração/CXM neste escopo.
- **Aplicação:** em replay multi-tenant, distinguir objeto técnico-base de tenant provisionado; validar efeitos e ownership por fluxo, não inferir semântica apenas por `status='active'`.
- **Skill:** `dominio-database-migrations/SKILL.md` ganhou orientação para bootstrap compatível com dependências históricas. Evidência de regressão reproduzida e ambos caminhos validados em CI; esforço ativo não medido.
