# Maestro — resumo de continuidade

Atualizado em 03/10/2026. Este arquivo permite que outro agente retome o trabalho com o contexto, os limites e as evidências essenciais. O roadmap detalhado e o inventário técnico continuam sendo as fontes aprofundadas.

## Goal ativo

**Plano acelerado — estabilizar o Maestro e publicar com segurança.**

Concluir o isolamento funcional entre módulos, validar integridade e migrations em Dev/local isolado, ensaiar recuperação/rollback e só então publicar o frontend no VPS autorizado e passar smoke tests. Escopo Maestro-only; CXM/CRM está explicitamente fora deste goal. Não alterar banco, infraestrutura ou código CXM.

## Ambientes confirmados pelo usuário

- Supabase Dev Maestro: `tqmfuskvllpqmvayjuqu` — Dashboard “Dominio Maestro Development”.
- Banco Supabase de Produção: `fwpisypiiezjhtqxlmqv` — Dashboard “Maestro BD producao”. Não usar durante o gate Dev; nenhuma escrita em Produção.
- Frontend de Produção: VPS `srv1611248.hstgr.cloud`, IP `187.127.27.151`. Este é o destino de publicação do frontend, distinto do banco Supabase.
- Trabalho atual: branch isolada, testes locais e CI. Deploy no VPS somente depois dos gates de release. Não confundir o badge Supabase `PRODUCTION` com hospedagem do frontend.

## Estado do repositório

- Checkout de trabalho: `/Users/grimm/.codex/worktrees/maestro-db-reconcile/dominio-maestro`.
- Branch: `codex/maestro-db-canonical-candidate`.
- Último checkpoint sincronizado: `1426faf64ca59006fbb56aafec74963687f5dc47` (commit e SHA remoto confirmados).
- CI `37141406252`: concluído com sucesso, 6/6 jobs para esse SHA.
- Últimas verificações focadas: roteamento/leitor JobHistory 5/5; `npm run verify:frontend-module-boundaries` aprovado; `git diff --check` aprovado.
- A documentação mais recente corrigiu uma afirmação anterior: no checkout candidato, list/filter/create de JobHistory vão para `maestro-core-data`; leitura usa relação e fallback legado quando ausente. A verificação foi documental/estática, não smoke autenticado do frontend implantado.

## Marcos e avanço registrado

| Marco | Conclusão | Pendente principal |
|---|---:|---|
| 1. Preparar release e confirmar ambientes | 80% | Preflight por destino e artefato/procedimento de rollback. |
| 2. Isolar falhas e fronteiras entre módulos | 79% | Completar revisão de consumidores/handlers; 19 itens no inventário ainda bloqueiam `release_ready`. Fluxos autenticados positivos pendentes para handlers indicados no roadmap. |
| 3. Integridade do banco em ambiente isolado | 55% | Resolver divergências do ledger/catálogo, validar upgrade com baseline Dev representativo e concluir auditoria objeto-a-objeto/hooks. A migration `0004` continua risco P0. |
| 4. Fluxos integrados prioritários | 20% | Expandir de testes de contenção de rotas para contratos e fluxos reais prioritários autenticados no Dev. |
| 5. Recuperação/rollback | 10% | Snapshot representativo, restauração operacional e rollback do frontend no VPS ainda não ensaiados. |
| 6. Publicação no VPS e smoke tests | 0% | Não começar até passarem os gates anteriores. |
| **Geral ponderado** | **44%** | Ainda não pronto para produção. |

Percentuais refletem a última reavaliação explícita do roadmap em 03/10/2026; Marco 3 55% e geral 44% após o upgrade cronológico do sufixo Dev em clone schema-only. Não contam como resolvidos o drift de ledger, os conflitos da migration `0004`, upgrades com dados representativos, recovery/rollback integral ou deploy. Atualizar apenas quando critérios de saída verificáveis mudarem.

## Evidências e riscos importantes

0. **Edge Functions Dev — snapshots correntes (03/10):** `system-reports` está v20 e corresponde byte a byte ao checkout após a reconciliação documentada abaixo. Nova leitura explícita do Dev confirmou `maestro-core-data` ACTIVE v10 e baixou sua fonte apenas para `/tmp`; `index.ts` e os sete imports compartilhados (`attachment-access`, `mutation-access`, `session-authorization`, `relational-job-history`, `project-schedule`, `session-renewal`, `safe-edge-error-context`) coincidem byte a byte com o checkout. Isso confirma paridade do bundle baixado, não caminho autenticado positivo, ausência de 5xx nem elegibilidade de release: a função continua pendente no manifesto enquanto consumidor/contrato e smoke integrado não forem fechados. Nenhuma função foi implantada nesta inspeção; Produção/VPS intocados.

1. **Isolamento frontend:** testes Playwright cobrem falha de chunk e falha de render nos dois sentidos Jobs↔Ads Brain e Dashboard↔Financeiro (8/8). Rotas vizinhas renderizam na mesma SPA. Há também verificador estático de boundaries e build no CI.
2. **Migration histórica `0004/publish_imported_records`:** auditoria agregada READ ONLY em Dev achou 71.185 payloads divergentes entre `migration.base44_records` e `legacy_records`; 63.264 são JobHistory. Timestamps de origem iguais não desempataram os conflitos; há diferenças em `duration_minutes`, `old_value`, `new_value` e `field`. A migration sobrescreve o payload inteiro em conflito. Não reaplicar/reparar/corrigir precedência sem proveniência e teste numa cópia representativa.
3. **Privacidade da auditoria:** consultas usadas para o drift retornaram apenas agregados; nenhum payload/ID foi registrado. Não criar cópia de dados de negócio sem procedimento aprovado e anonimização adequada.
4. **JobHistory:** o checkout candidato despacha list/filter/create para `maestro-core-data`, usa `maestro_job_history` e faz fallback para `legacy_records` quando a relação não está disponível. Testes de tenant, filtros, sort, paginação, mapeamento e erros passaram. Falta smoke positivo com sessão de teste e comprovação de paridade operacional em Dev. A divergência de conteúdo de `0004` não está resolvida.
5. **Testes de banco:** há clean replay no CI e fixtures de upgrade focadas (inclusive financeiro) com tenants sintéticos e rollback. Isso não equivale a upgrade integral sobre cópia representativa do Dev com catálogo/hooks completos.
6. **Clone local:** o clone Dev-shaped anteriormente inspecionado era schema-only, sem dados; não serve como baseline representativa. A tentativa `docker` no contexto default falhou por socket ausente, mas Colima estava ativo e o contexto `colima` funcionou. No último check não havia container `maestro-upgrade-test` rodando. Não tocar em containers CXM.
7. **Deploy/rollback:** nada foi publicado no VPS e Produção Supabase não foi alterada. Não há preflight de acesso/versão do VPS nem artefato de rollback comprovado neste checkpoint.

## Próxima sequência recomendada

1. Retomar pela proveniência dos conflitos de `0004`: localizar metadados/contrato de importação e determinar como obter uma cópia representativa **sanitizada**; sem isso, não escolher snapshot ou destino como autoridade.
2. Em clone local Dev-shaped com dados sintéticos ou sanitizados autorizados, reproduzir upgrade completo relevante e testar preservação/paridade de eventos, ordenação, paginação, autorização por tenant/job e rollback. Manter Dev hosted em somente leitura durante essa investigação.
3. Continuar a reconciliação do catálogo e ledger Dev, classificando cada diferença pelo efeito; validar instalação limpa e upgrade representativo, RLS, constraints, grants, hooks e relações tenant-aware.
4. Fechar inventário dos 19 blockers de release e provar os fluxos prioritários autenticados no Dev com credenciais/conta de teste autorizadas; não disparar sincronizações de anúncios ou outras ações externas sem fixture/controle.
5. Ensaiar backup/restauração e rollback em ambiente não produtivo; fazer preflight de VPS estritamente read-only para identificar versão e procedimento de recuperação.
6. Somente após todos os gates: rever diff, commit/push sem force-push, confirmar SHA e CI, publicar frontend no VPS autorizado e executar smoke test/monitoramento com rollback disponível. Nenhuma migration deve ser promovida sem aprovação e teste explícito separado.

## Regras de retomada

- Não repetir provas já registradas sem motivo; verificar estado atual antes de confiar em snapshots antigos.
- Nunca usar Produção Supabase como Dev; nunca escrever em Produção durante os gates.
- Não publicar no VPS antes do Marco 6 estar desbloqueado por critérios verificáveis.
- Excluir CXM/CRM de pesquisa operacional, testes, commits e deploy deste goal.
- Após cada marco: revisar diff, commit e push sem force-push, confirmar SHA remoto e CI. Registrar evidência e riscos residuais no roadmap.
- Não marcar goal concluído só porque CI está verde; faltam upgrade representativo, fluxos autenticados, recuperação/rollback e publicação com smoke.

## Documentos de referência

- [Roadmap e progresso dos marcos](roadmap-finalizacao-banco-maestro-cxm.md)
- [Reconciliação de migrations e drift](migration-drift-reconciliation.md)
- [Mapa funcional do sistema](system-functional-map.md)
- [Lições de engenharia](engineering/lessons-learned.md)
