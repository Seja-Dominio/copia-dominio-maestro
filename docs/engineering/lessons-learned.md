# Lições de engenharia

## Migrations multi-relação: classificar alvos antes do pacote — 30/09/2026

- **Evidência:** a migration `20260926520000_add_authenticated_organization_rls` mistura 33 tabelas; Produção tem 33 e 132 policies, Dev tem 9 e nenhuma policy, e 12 tabelas não aparecem no registry de ownership. Busca direta em `dominus-webhook`, `dominus-audit` e migrations de operações core ligou todos os 12 a consumidores Maestro, embora AppConfig e dados conversacionais/logs ainda exijam escopos de acesso específicos. O alvo SQL não faz guarda de existência. O caso demonstra que owner de produto não determina, por si só, autorização ou tenant policy.
- **Resultado validado:** o replay integral da branch limpa passou no CI `36808101999`; isso não resolve os ledgers/objetos divergentes nos ambientes remotos. O manifesto suplementar + gate local reconciliam 21 owners do registry e 12 owners com evidência no código, falhando para alvos novos sem classificação. A regra de não mascarar baseline incompatível evita declarar reconciliação com base em guards que apenas pulam objetos ausentes.
- **Aplicação:** migrations multi-tabela, RLS e pacotes por produto; inventariar alvos, owner, presença por ambiente e dependências antes de particionar ou testar upgrade.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, com esse cruzamento obrigatório e a ressalva contra guards silenciosos. Esforço ativo: não medido.

## RPC `SECURITY INVOKER`: testar o papel executor — 01/10/2026

- **Evidência:** `resolve_job_task_reconciliation` tinha EXECUTE restrito e configuração segura, mas uma chamada sob `service_role` no clone isolado falhou por falta de privilégio nas colunas da tabela usada internamente. O teste estrutural anterior não detectava a falha.
- **Correção validada:** grants mínimos por coluna, leitura explícita apenas das colunas necessárias e lock transacional por item; regressão rollback-only passou para sucesso, isolamento cross-tenant, replay da resolução, privilégios mínimos e atomicidade.
- **Aplicação:** RPCs PostgreSQL `SECURITY INVOKER` em migrations de qualquer módulo; validar com o papel real e testar permissões efetivas além do catálogo da função.
- **Skill atualizada:** `dominio-database-migrations/SKILL.md`, acrescentando chamada real como papel invoker e teste transacional tenant-aware. Mudança pequena e acionável, sustentada por defeito funcional reproduzido e correção validada.

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
