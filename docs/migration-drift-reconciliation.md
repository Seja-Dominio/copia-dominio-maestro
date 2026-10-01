# Reconciliação read-only dos ledgers de migrations

Auditoria reexecutada em 30/09/2026 contra o checkout da branch `codex/maestro-db-canonical-candidate`. Nenhum `db push`, `migration repair`, alteração de catálogo ou DDL remoto foi executado. A tabela e listas iniciais desta página são a fotografia da primeira coleta de 30/09; a seção “Revalidação atual após 451a60f” abaixo é a referência mais recente e prevalece quando os números divergem.

## Método e limites

- O checkout atual contém 173 migrations. A comparação foi reexecutada com `scripts/reconcile-migration-ledgers.mjs`, usando fingerprints SHA-256 de tokens SQL normalizados; comentários, espaços e terminadores não afetam o fingerprint, enquanto literais e corpos dollar-quoted são preservados.
- Ledgers consultados em transação PostgreSQL `READ ONLY`, confirmada como `on`, depois de validar a ref da conexão: Dev `tqmfuskvllpqmvayjuqu`; Produção `fwpisypiiezjhtqxlmqv`.
- Comparação usa sequência de statements tokenizada: terminadores, comentários e espaços não afetam fingerprint; strings, identificadores quoted e corpos dollar-quoted são preservados.
- O relatório guarda identidades e contagens, não SQL remoto, URL, credenciais nem dados de negócio.
- Fingerprint igual comprova conteúdo SQL normalizado igual no ledger; não comprova que os catálogos atuais sejam iguais. Fingerprint diferente não prova, sozinho, se a diferença é segura ou material.

## Resumo

| Ambiente | Ledger remoto | Mesmo par versão/nome e conteúdo igual | Mesmo par com conteúdo diferente | Mesmo nome/outra versão: conteúdo igual | Mesmo nome/outra versão: conteúdo diferente | Mesmo conteúdo/outro nome | Conteúdo local sem fingerprint remoto | Conteúdo remoto sem fingerprint local |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dev | 83 | 22 | 9 | 45 | 6 | 0 | 97 | 16 |
| Produção | 111 | 15 | 2 | 60 | 23 | 10 | 86 | 26 |

“Conteúdo local sem fingerprint remoto” inclui casos de mesmo nome/outra versão cujo conteúdo difere; portanto essas colunas se sobrepõem e não devem ser somadas. “Conteúdo remoto sem fingerprint local” também inclui conteúdo divergente para a mesma identidade. Os valores classificam correspondência de conteúdo entre arquivos e ledger, não o efeito atualmente presente no schema.

> A tabela acima permanece como evidência histórica da primeira coleta, não como contagem vigente. A revalidação posterior encontrou 174 arquivos; consulte o snapshot mais recente ao fim desta página.

## Mesmo par versão/nome, SQL divergente

| Ambiente | Migrations |
|---|---|
| Dev | `0004/publish_imported_records`; `20260910100000/enable_whatsapp_automation_scheduler`; `20260923151011/persist_job_project_mutations_with_audit`; `20260923155416/restrict_rls_event_trigger_rpc`; `20260926004418/cxm_webhook_durable_queue`; `20260926005052/cxm_webhook_environment_scoped_cron`; `20260926005755/cxm_webhook_synthetic_test_gate`; `20260926235437/revoke_client_access_from_server_managed_tables`; `20260928031940/cxm_silence_due_jobs_organization_scope` |
| Produção | `0004/publish_imported_records`; `20260910100000/enable_whatsapp_automation_scheduler` |

## Mesmo nome em outra versão, SQL divergente

| Ambiente | Arquivo local | Ledger remoto |
|---|---|---|
| Dev | `20260927023629/bootstrap_dominio_tenant` | `20260927023749/bootstrap_dominio_tenant` |
| Dev | `20260927032000/allow_authenticated_membership_self_read` | `20260929183217/allow_authenticated_membership_self_read` |
| Dev | `20260929032219/core_tenant_dual_writes` | `20260929033032/core_tenant_dual_writes` |
| Dev | `20260929165050/maestro_financial_entries_scoped_atomic_write` | `20260929175330/maestro_financial_entries_scoped_atomic_write` |
| Produção | `20260923155416/restrict_rls_event_trigger_rpc` | `20260925164251/restrict_rls_event_trigger_rpc` |
| Produção | `20260926130000/stage_legacy_organization_scope` | `20260926195638/stage_legacy_organization_scope` |
| Produção | `20260926140000/create_relational_work_core` | `20260926195902/create_relational_work_core` |
| Produção | `20260926230000/create_relational_job_history` | `20260926203439/create_relational_job_history` |
| Produção | `20260926250000/create_reconciliation_resolution_rpc` | `20260926204339/create_reconciliation_resolution_rpc` |
| Produção | `20260926260000/scope_legacy_mutations` | `20260926205033/scope_legacy_mutations` |
| Produção | `20260926300000/scope_memory_audit_tables` | `20260926210341/scope_memory_audit_tables` |
| Produção | `20260926530000/create_dual_write_health_view` | `20260926225455/create_dual_write_health_view` |
| Produção | `20260927032000/allow_authenticated_membership_self_read` | `20260929183220/allow_authenticated_membership_self_read` |

## Conteúdo SQL local sem fingerprint equivalente no ledger

As identidades abaixo são a lista completa dos arquivos locais cujo conteúdo SQL não teve fingerprint correspondente no ledger consultado. Isso **não** significa que o efeito esteja ausente do banco: pode ter sido aplicado como outra migration, alterado manualmente ou aplicado parcialmente. A classificação de produto é visível no nome quando possível; itens CXM permanecem fora de qualquer pacote não-CXM.

### Dev — 91 migrations

```text
20260917150839/dominus_learning_review_comments
20260926200000/create_relational_agenda_events
20260926203000/dual_write_relational_agenda_events
20260926210000/create_relational_timesheets
20260926213000/dual_write_relational_timesheets
20260926220000/create_relational_notifications
20260926223000/dual_write_relational_notifications
20260926233000/create_relational_webhook_receipts
20260926240000/scope_reconciliation_queue
20260926243000/harden_organization_constraints
20260926250000/create_reconciliation_resolution_rpc
20260926260000/scope_legacy_mutations
20260926263000/scope_external_legacy_writes
20260926270000/create_organization_integrations
20260926273000/harden_trigger_permissions_and_fk_indexes
20260926290000/scope_cxm_collaboration_tables
20260926300000/scope_memory_audit_tables
20260926320000/create_relational_ai_query_logs
20260926330000/create_relational_whatsapp_directory
20260926360000/create_relational_templates_and_documents
20260926370000/dual_write_templates_and_documents
20260926380000/create_relational_nps
20260926390000/dual_write_nps
20260926400000/create_relational_job_comments
20260926410000/dual_write_job_comments
20260926420000/create_relational_webhook_parsed
20260926430000/dual_write_webhook_parsed
20260926440000/create_relational_dominus_operations
20260926450000/dual_write_dominus_operations
20260926460000/create_relational_task_audit_logs
20260926470000/dual_write_task_audit_logs
20260926480000/create_relational_operational_configs
20260926490000/dual_write_operational_configs
20260926500000/create_relational_whatsapp_automations
20260926510000/dual_write_whatsapp_automations
20260926520000/add_authenticated_organization_rls
20260926530000/create_dual_write_health_view
20260926540000/restrict_dual_write_health_view
20260926550000/create_legacy_cutover_registry
20260926570000/freeze_financial_dimensions_legacy_writes
20260926580000/mark_financial_dimensions_relational_writes
20260926590000/freeze_financial_entry_legacy_writes
20260926600000/freeze_client_legacy_writes
20260926610000/freeze_document_legacy_writes
20260926620000/freeze_notification_legacy_writes
20260926630000/freeze_timesheet_legacy_writes
20260926640000/create_legacy_cutover_health_view
20260926650000/expand_legacy_cutover_health
20260926660000/freeze_insights_nps_legacy_writes
20260926670000/freeze_comment_legacy_writes
20260926680000/promote_whatsapp_automation_relational_reads
20260926690000/promote_whatsapp_directory_relational_reads
20260926700000/freeze_agenda_event_legacy_writes
20260926710000/freeze_project_legacy_writes
20260926720000/freeze_job_subtask_legacy_writes
20260926730000/freeze_whatsapp_relational_writes
20260926740000/enable_internal_product_modules
20260926750000/freeze_dominus_webhook_parsed_writes
20260927014950/revoke_client_access_from_server_managed_tables_complete
20260927023527/explicit_edge_service_role_grants
20260927030503/revoke_unneeded_client_table_privileges
20260927030941/revoke_public_default_function_execution
20260927031036/revoke_global_public_function_execution
20260927051730/prevent_legacy_organization_reassignment
20260927053724/cxm_silence_due_jobs_tenant_scope
20260927060831/enforce_mini_task_assignee_tenant_scope
20260927062420/enforce_job_task_assignee_tenant_scope
20260927062705/enforce_agenda_collaborator_tenant_scope
20260927063011/enforce_timesheet_job_tenant_scope
20260927063559/protect_notification_tenant_references
20260927204529/enforce_remaining_tenant_relationships
20260927204934/enforce_team_chat_member_scope
20260927220141/transfer_subtasks_relational_atomic
20260927231924/google_calendar_sync
20260927232653/reconcile_environment_scoped_cron_jobs
20260928002944/save_google_calendar_selection_atomically
20260928003825/delete_timesheets_with_atomic_audit
20260928011643/scope_explicit_tenant_relational_dual_writes
20260928020617/enforce_optional_client_relations_tenant_fk
20260928130650/add_tenant_aware_timesheet_client_project_relations
20260929012715/grant_legacy_records_service_role_access
20260929013216/restrict_legacy_records_service_role_to_dml
20260929020818/financial_delete_atomic_recovery_snapshot
20260929220702/task_audit_log_scope_from_row_org_id
20260929224533/resolve_job_task_reconciliation_exact_match
20260929232021/mode_aware_legacy_cutover_health
20260930012652/timesheet_admin_atomic_relational_operations
20260930022408/harden_job_history_tenant_scope_and_trigger
20260930140000/repair_timesheet_payload_projection
20260930160000/reinforce_cxm_silence_due_tenant_scope
20260930170000/reject_cross_tenant_core_projection_references
```

### Produção — 63 migrations

```text
20260917150839/dominus_learning_review_comments
20260926004418/cxm_webhook_durable_queue
20260926005052/cxm_webhook_environment_scoped_cron
20260926005158/cxm_webhook_queue_payload_retention
20260926005755/cxm_webhook_synthetic_test_gate
20260926202937/cxm_inbox_scope_indexes
20260926231011/cxm_silence_due_queue
20260926235437/revoke_client_access_from_server_managed_tables
20260927003711/revoke_direct_client_access_to_legacy_records
20260927005839/ads_brain_server_sync_scheduler
20260927014950/revoke_client_access_from_server_managed_tables_complete
20260927023527/explicit_edge_service_role_grants
20260927023629/bootstrap_dominio_tenant
20260927030000/add_tenant_aware_core_foreign_keys
20260927030503/revoke_unneeded_client_table_privileges
20260927030941/revoke_public_default_function_execution
20260927031000/validate_tenant_aware_core_foreign_keys
20260927031036/revoke_global_public_function_execution
20260927051730/prevent_legacy_organization_reassignment
20260927053724/cxm_silence_due_jobs_tenant_scope
20260927060831/enforce_mini_task_assignee_tenant_scope
20260927062420/enforce_job_task_assignee_tenant_scope
20260927062705/enforce_agenda_collaborator_tenant_scope
20260927063011/enforce_timesheet_job_tenant_scope
20260927063559/protect_notification_tenant_references
20260927203354/enforce_ads_brain_tenant_relationships
20260927203623/index_ads_authorization_tenant_membership
20260927204529/enforce_remaining_tenant_relationships
20260927204934/enforce_team_chat_member_scope
20260927220141/transfer_subtasks_relational_atomic
20260927231924/google_calendar_sync
20260927232653/reconcile_environment_scoped_cron_jobs
20260927233557/repair_relational_core_dual_write_fks
20260928000832/meta_oauth_single_use_state
20260928002944/save_google_calendar_selection_atomically
20260928003825/delete_timesheets_with_atomic_audit
20260928011643/scope_explicit_tenant_relational_dual_writes
20260928020000/atomic_cxm_appointment_reservation
20260928020617/enforce_optional_client_relations_tenant_fk
20260928022842/enforce_relational_identity_pairing
20260928031940/cxm_silence_due_jobs_organization_scope
20260928130650/add_tenant_aware_timesheet_client_project_relations
20260928181132/cxm_assignment_round_robin
20260928191515/cxm_pipeline_stage_automation_queue
20260928193744/harden_cxm_pipeline_stage_event_identity
20260928210225/cxm_silence_follow_up_sequence_steps
20260928220143/cxm_agency_sales_stage_automation
20260928222714/cxm_agency_sales_pipeline_identity
20260929012715/grant_legacy_records_service_role_access
20260929013216/restrict_legacy_records_service_role_to_dml
20260929020818/financial_delete_atomic_recovery_snapshot
20260929021956/index_meta_oauth_state_foreign_keys
20260929032219/core_tenant_dual_writes
20260929032932/core_delete_projection_cleanup
20260929034000/prepare_core_cutover_registry
20260929220702/task_audit_log_scope_from_row_org_id
20260929224533/resolve_job_task_reconciliation_exact_match
20260929232021/mode_aware_legacy_cutover_health
20260930012652/timesheet_admin_atomic_relational_operations
20260930022408/harden_job_history_tenant_scope_and_trigger
20260930140000/repair_timesheet_payload_projection
20260930160000/reinforce_cxm_silence_due_tenant_scope
20260930170000/reject_cross_tenant_core_projection_references
```

## Conteúdo do ledger remoto sem fingerprint correspondente no checkout

- **Dev (14):** `0004/publish_imported_records`; `20260910100000/enable_whatsapp_automation_scheduler`; `20260923151011/persist_job_project_mutations_with_audit`; `20260923155416/restrict_rls_event_trigger_rpc`; `20260926004418/cxm_webhook_durable_queue`; `20260926005052/cxm_webhook_environment_scoped_cron`; `20260926005755/cxm_webhook_synthetic_test_gate`; `20260926235437/revoke_client_access_from_server_managed_tables`; `20260927023749/bootstrap_dominio_tenant`; `20260927025837/revoke_unsafe_organization_grants_and_trigger_rpc`; `20260928031940/cxm_silence_due_jobs_organization_scope`; `20260929033032/core_tenant_dual_writes`; `20260929175330/maestro_financial_entries_scoped_atomic_write`; `20260929183217/allow_authenticated_membership_self_read`.
- **Produção (11):** `20260910100000/enable_whatsapp_automation_scheduler`; `20260925164251/restrict_rls_event_trigger_rpc`; `20260926195638/stage_legacy_organization_scope`; `20260926195902/create_relational_work_core`; `20260926203439/create_relational_job_history`; `20260926204339/create_reconciliation_resolution_rpc`; `20260926205033/scope_legacy_mutations`; `20260926210341/scope_memory_audit_tables`; `20260926225455/create_dual_write_health_view`; `20260927011925/ads_brain_server_sync_scheduler_6h`; `20260929183220/allow_authenticated_membership_self_read`.

## Cruzamento com o catálogo remoto (mesma sessão read-only)

- O cron `whatsapp_automation_runner` está ativo com agenda `*/5 * * * *` em Dev e Produção. Os fingerprints dos comandos são diferentes entre projetos; o texto dos comandos foi deliberadamente omitido, pois pode carregar endpoint/configuração sensível. Os statements dos dois ledgers contêm schedule e unschedule para esse job, então a diferença da migration `20260910100000` isolada não significa que o cron esteja ausente hoje.
- Dev também tem `cxm_webhook_queue_runner` ativo a cada minuto; Produção não tem esse job.
- Dev possui as assinaturas `cxm_webhook_queue_enqueue(text,text,jsonb)` e `(text,text,jsonb,boolean)`. Ambas são `SECURITY DEFINER`, `search_path` vazio e têm `EXECUTE` somente efetivo para `service_role` entre `anon`, `authenticated` e `service_role`. Produção não possui essas funções. Isso é consistente com versões diferentes da instalação do CXM, mas ainda não comprova um produto standalone.
- O SQL local para a fila CXM especifica `p_test_mode`, enquanto o conteúdo exato do primeiro migration ledger Dev usa assinatura de três argumentos; outra migration remota introduz a variante de quatro argumentos. O estado catalogado Dev contém ambas e as permissões foram verificadas. A variante de três argumentos não está exposta a clientes, mas sua remoção/compatibilidade precisa de plano próprio.
- Essa inspeção de catálogo reduz a ambiguidade sobre jobs/funções atuais, mas não compara o restante do catálogo, as definições de cada cron command, os dados, secrets, storage, Auth, Edge Functions ou schedulers do CXM separado.

## Decisão operacional

1. Não executar `supabase migration repair`, `db push` ou inserções manuais no ledger a partir deste relatório.
2. Investigar primeiro os 10 pares com o mesmo version/nome e SQL diferente: confirmar SQL efetivamente executado, objetos atuais e logs/deploy source; prioridade a `enable_whatsapp_automation_scheduler` e às migrations CXM/ACL.
3. Para cada migration com versão diferente, comparar statements completos e catálogo pós-migration em clone limpo/branch isolada; registrar correspondência sem renumerar histórico remoto.
4. Obter exportação completa dos 90/62 fingerprints não representados e dos 14/11 fingerprints remotos não representados, com dependências e classificação de produto (CXM, Maestro, compartilhado, Ads Brain, Insights).
5. Só então desenhar pacote de avanço específico por ambiente, com sequenciamento, idempotência, verificação pré/pós, backup, rollback e manifesto que exclua CXM do pacote Maestro.

**Resultado:** a divergência de histórico foi confirmada e quantificada, mas reconciliação está **incompleta**. Não há base para `migration repair`, release unificado, cutover ou alteração de produção.

## Classificação adicional por efeito — 30/09/2026

As consultas abaixo foram feitas novamente em Dev (`tqmfuskvllpqmvayjuqu`) e Produção (`fwpisypiiezjhtqxlmqv`), cada uma em transação `READ ONLY` verificada e revertida. Corpos de função não foram registrados; comparação de tokens substituiu literais de texto/número por marcadores.

| Caso | Evidência efetiva | Classificação atual | Consequência |
|---|---|---|---|
| `maestro_apply_legacy_mutation` / `persist_job_project_mutations_with_audit` | Mesma assinatura, `SECURITY INVOKER`, `search_path` vazio e EXECUTE efetivo somente para `service_role` nos dois ambientes. O corpo de Produção é token-equivalente ao arquivo local após remoção de comentários/literais; o corpo de Dev torna-se token a token equivalente após expandir `v_effective_payload` para sua expressão `coalesce(p_payload, '{}')`. | **Efeito equivalente; identidade/versionamento do ledger diferente.** O fingerprint bruto de catálogo difere Dev↔Produção por refatoração local, mas a normalização controlada não encontrou diferença no corpo executável. | Não fazer repair/replay por causa desse fingerprint isolado. Fixar a equivalência com teste de regressão da mutação parcial antes de qualquer pacote de atualização. |
| `cxm_webhook_durable_queue` no Dev | A entrada de ledger de `20260926004418` contém enqueue de três argumentos; o catálogo Dev tem essa sobrecarga e a de quatro argumentos. Ambas são `SECURITY DEFINER`, `search_path` vazio, sem EXECUTE para `anon`/`authenticated` e com EXECUTE para `service_role`. A migration local e `cxm_webhook_synthetic_test_gate` definem a forma de quatro argumentos com `p_test_mode`. Produção não tem a fila/CXM instalado. | **Histórico remoto divergente e compatibilidade CXM não encerrada.** A sobrecarga de três argumentos permanece no Dev; não se provou se há consumidor ativo ou se pode ser removida. | Não expor em release Maestro. Antes de mudar/remover, mapear referências e cron/Edge Function em execução, testar os overloads com autorização negativa e planejar contração compatível. |
| `cxm_silence_due_jobs_organization_scope` | A relação existe em Dev e a constraint `cxm_silence_due_jobs_organization_client_fkey` não existe, como esperado após `DROP CONSTRAINT IF EXISTS`; em Produção a relação inteira não existe. | **Diferença de instalação CXM entre ambientes, não discrepância de estado do Maestro.** | Não criar tabela/fila CXM em Produção no trilho não-CXM; tratar na trilha CXM com plano de instalação próprio. |

### Limites desta classificação

- A equivalência normalizada de uma RPC não resolve as demais divergências do ledger. Ainda falta classificar cada migration e seus efeitos, principalmente os pares com SQL divergente e todo conteúdo local/remoto sem correspondência.
- O catálogo não prova ausência de consumidores externos, código Edge ativo ou chamadas por jobs. Não removemos sobrecargas nem tabelas e não alteramos dados, ledger, cron, função ou configuração.
- Resultado operacional permanece: **sem `migration repair`, `db push` integral ou promoção**. O pacote não-CXM segue `release_ready=false`; manter dependências CXM explicitamente fora dele.

## Revalidação estática da fronteira de Edge Functions — 30/09/2026

- `node scripts/verify-edge-function-product-boundaries.mjs` retornou `status: ok` para a consistência estrutural do manifesto: 18 funções atuais, três candidatas, seis bloqueadas como compartilhadas, oito pendentes não-CXM e duas exclusões CXM deliberadas sem diretório correspondente. `release_ready=false`, com 14 bloqueios; “status ok” não é autorização de deploy.
- Uma busca textual no código atual de `supabase/functions` não encontrou nomes `cxm_*`, `CXM`, `cxm-data` ou `cxm-deskcomm-sso`. As duas funções CXM não existem na árvore atual. Isso corrige a descrição histórica anterior que atribuía chamadas diretas `cxm_*` a `dominus-webhook`/`whatsapp-send`; ela não descreve o commit auditado.
- O resultado não comprova uma fronteira de dados: código pode acessar registros de produto por chave dinâmica. `maestro-data` recebe `entity` dinâmica e lê/escreve `legacy_records`; não há allowlist por produto/entitlement nesse dispatch mostrado pela auditoria. `whatsapp-send` usa `service_role`, sua sessão lê o perfil global sem confirmar membership ativa, e leituras, mutações e scheduler de `legacy_records` não aplicam `organization_id`; a configuração Evolution também vem de variáveis globais. Isso justifica manter ambas as rotas bloqueadas sem afirmar dependência CXM nominal.
- O validador atual confere classificação entre diretórios e manifesto; não analisa imports, nomes de entidades dinâmicos, permissões efetivas, cron, secrets nem acesso a tabelas. Não promover a lista candidata a pipeline real até adicionar essas provas e mapear por instalação as integrações externas.
- Nenhum código, banco, cron ou segredo foi alterado durante esta auditoria. Próxima fatia de segurança: contratos de sessão/entitlement por produto e allowlist de entidades por domínio; depois tenant-scope de WhatsApp e verificação de consumo programado com organizações separadas. Até então: manter CXM fora do pacote Maestro e `release_ready=false`.

## Estado relacional de WhatsApp/CXM — consulta agregada read-only, 30/09/2026

- O registry canônico local (`20260926550000_create_legacy_cutover_registry.sql`) classifica `WhatsappContact`, `WhatsappGroup` e `WhatsappAutomation` como `module_key='cxm'`; tabelas relacionais correspondentes são `maestro_whatsapp_contacts`, `maestro_whatsapp_groups` e `maestro_whatsapp_automations`.
- Dev não contém `organization_integrations` nem as três tabelas relacionais de WhatsApp; contém um registro legado `WhatsappAutomation`, com `organization_id` preenchido. Produção contém as quatro tabelas: `organization_integrations` tem uma integração WhatsApp ativa associada a uma organização; as tabelas relacionais têm 2.662 contatos, 290 grupos e 4 automações, todas associadas a uma organização. `legacy_records` tem as mesmas contagens por entidade e zero linhas sem `organization_id`. Foram consultadas apenas contagens, sem IDs, nomes, telefones, payloads ou metadados.
- Cada projeto foi validado pela ref esperada; consulta em transação `READ ONLY` confirmada, revertida ao final. Esses números são fotografia de 30/09/2026 e não comprovam paridade do conteúdo nem a integridade de backfill entre tabelas.
- O código de execução `whatsapp-send` e `dominus-webhook` ainda obtém endpoint/API key/instância de variáveis globais `EVOLUTION_*`; `organization_integrations` registra vínculo/estado, mas o código consultado não a usa para resolver credenciais por tenant. Logo a tabela relacional em Produção não equivale a integração CXM independente ou a isolamento de credenciais.
- Consequência: Dev não é snapshot representativo para upgrade das entidades CXM que já existem em Produção; a prova de atualização precisa partir de clone/restauração de Produção sem dados identificáveis e incluir comparação de contagens/IDs/payloads. Não executar replay completo ou push em Dev/Produção para “alinhar”. O domínio WhatsApp/CXM fica fora do release não-CXM até haver instalação/upgrade isolado e testes de tenant, credenciais, workers e rollback.

## Verificação adicional read-only de constraints e grants — 30/09/2026

- No projeto de Produção (`fwpisypiiezjhtqxlmqv`, branch `main`), consultas no SQL Editor foram executadas em transações `BEGIN READ ONLY`; nenhuma migration, DDL, grant, dado ou ledger foi alterado.
- As quatro relações `maestro_clients`, `maestro_projects`, `maestro_jobs` e `maestro_job_tasks` existem. O catálogo mostra FKs simples `maestro_job_tasks.job_id → maestro_jobs.id`, `maestro_jobs.client_id → maestro_clients.id` e `maestro_jobs.project_id → maestro_projects.id`, além das FKs individuais `organization_id → organizations.id`; as uniques observadas incluem `(organization_id, legacy_record_id)`.
- Não foram encontradas as três uniques `(organization_id, id)` nem as quatro FKs compostas tenant-aware esperadas pelo arquivo `20260927030000_add_tenant_aware_core_foreign_keys.sql`. A consulta ao catálogo também retornou zero triggers de usuário ligados diretamente às quatro tabelas. Isso deixa sem prova a proteção a nível de tabela; RPCs, Edge Functions e triggers em `legacy_records` ainda precisam ser auditados e testados com tentativa negativa cross-tenant. Até essa prova, a integridade direta dessas relações não pode ser considerada concluída.
- RLS está habilitado (não FORCE) nas quatro tabelas e cada uma tem quatro policies. As policies `authenticated` correlacionam `organization_id` à membership ativa do `auth.uid()`; DELETE exige papel `master`/`gestor`. Isto protege o caminho PostgREST autenticado coberto por essas policies, mas não substitui as FKs compostas. O `service_role` tem `SELECT/INSERT/UPDATE/DELETE` efetivos nas quatro tabelas e bypassa RLS; logo o isolamento das escritas privilegiadas depende de RPCs/Edge Functions e precisa de prova explícita.
- Busca estática atual em `supabase/functions` e `src/api` achou os mapeamentos do reader, mas nenhuma escrita direta explícita via `.from()`/SQL para essas quatro relações. Isso sugere que escritas existentes passam por RPCs/triggers de projeção em `legacy_records`, porém não cobre SQL dinâmico nem código remoto; a cadeia completa ainda precisa ser traçada antes de tratar como garantia.
- Privilégios efetivos em `public.legacy_records`: `anon` e `authenticated` têm `SELECT/INSERT/UPDATE/DELETE/TRUNCATE = false`; `service_role` tem os cinco privilégios como `true`. Isto atualiza o snapshot de grants de 28/09 registrado no roadmap: o acesso direto por roles cliente não se reproduziu na medição atual. Default privileges, policies e as demais tabelas server-managed seguem para auditoria; `service_role` permanece uma fronteira privilegiada.
- Estatísticas `reltuples` vistas durante a inspeção são aproximadas; não foram usadas como contagem nem como prova de paridade dos dados.

## Revalidação live do núcleo tenant-aware — 30/09/2026

- Reexecutado o preflight em Dev (`tqmfuskvllpqmvayjuqu`) e Produção (`fwpisypiiezjhtqxlmqv`) pelo Supabase CLI, cada consulta em `BEGIN READ ONLY`, verificando `transaction_read_only=on` e encerrando com `ROLLBACK`. A consulta não retornou IDs nem payloads. Os dois ledgers continuam com Dev 83 entradas (última versão `20260929183217`) e Produção 111 (última versão `20260929183220`), sem entradas de statements vazios. O checkout agora tem 173 arquivos; portanto a migration local `20260930170000_reject_cross_tenant_core_projection_references` ainda não consta no último versionamento remoto observado. Nenhum ledger ou catálogo foi alterado.
- Em Produção, as sete constraints esperadas para `(organization_id,id)` e relações core tenant-aware estão ausentes. Em Dev, as sete estão presentes e validadas. As quatro relações têm RLS habilitado nos dois ambientes e `FORCE ROW LEVEL SECURITY` desligado. Isso confirma drift de catálogo em Produção; não autoriza aplicar as migrations, sobretudo antes de provar a atualização em clone representativo.
- O trigger ativo `legacy_records_relational_work_core_sync` aponta para `maestro_sync_relational_work_core()` nos dois projetos. Em Produção, a função está como `SECURITY DEFINER` com `search_path=public`, projeta apenas os IDs legados de Client/Project e não contém a nova rejeição para referências que resolvem em outro tenant. Em Dev, a função já resolve UUIDs no tenant corrente e usa `search_path` vazio, mas ainda não rejeita o caso em que o ID legado só resolve fora do tenant. Portanto o efeito da migration local `20260930170000_reject_cross_tenant_core_projection_references` não está presente em nenhum dos dois catálogos; Dev tem uma versão intermediária mais avançada. Isso classifica a migration como **pendente por efeito**, não só ausente por identidade do ledger.
- A migration não-CXM `20260930140000_repair_timesheet_payload_projection` também não aparece nos ledgers até as versões atuais. Uma consulta agregada `READ ONLY` à Produção encontrou 8.938/8.938 `maestro_timesheets` elegíveis para preencher `duration_minutes`, `started_at` e `ended_at` a partir de `source_payload`; portanto a correção de dados ainda está pendente no estado observado. A relação `maestro_timesheets` não existe no Dev, que não é um clone representativo para essa atualização. Tratar como backfill real: reproduzir com dados sintéticos anonimizados em clone do schema de Produção, validar conversões/idempotência e rollback antes de qualquer execução remota. Nenhum payload foi retornado.
- Nos quatro vínculos auditados (Project→Client, Job→Project, Job→Client, Subtask→Job), ambos os ambientes retornaram zero relações tipadas apontando para parent de outro tenant e zero divergências entre UUID e identificador legado. O preflight também encontrou, em Produção, 8 Project→Client, 2 Job→Project, 2 Job→Client e 114 Subtask→Job sem UUID tipado, embora exista parent relacional do mesmo tenant para o identificador legado. Em Dev, os três primeiros casos são zero e não há Subtask→Job nessa condição.
- Para subtarefas com `job_id` nulo e `legacy_job_record_id` preenchido, Produção contém 616 casos: 114 identificadores correspondem a Job projetado do mesmo tenant e 502 não correspondem a nenhum Job da projeção. Nenhum dos 616 encontrou registro `Job` em `legacy_records` pelo par tenant/ID (nem exclusivamente em outro tenant). Em Dev, os 478 casos também não encontraram parent `Job` em `legacy_records` nem na projeção. A categoria “não encontrado” descreve apenas as tabelas/IDs atuais consultados; não prova causa histórica, nem justifica inferir associação. Preservar esses registros como exceções até conferir snapshot/audit trail e estabelecer política explícita de retenção ou reparo.
- O caminho eficiente é testar no clone os 114 vínculos Produção cuja chave legada coincide com um Job do mesmo tenant — comparando payload e histórico antes de preencher qualquer FK — e separar os 502/478 sem parent correspondente como exceções. Não criar constraints ou executar backfill na Produção enquanto essa classificação, clone representativo e rollback não forem aprovados.
- O arquivo `scripts/sql/audit_core_tenant_integrity.sql` agora produz um único result set (compatível com o Supabase CLI) e inclui evidência agregada do parent legado em `legacy_records`; a execução read-only atual passou em Dev e Produção. Essa revisão ainda precisa de CI após commit para validar o clean-room. O preflight melhora a classificação de dados, mas não reconcilia as 173 migrations, não prova igualdade de RPCs/Edge Functions e não fecha o gate de release.

## Teste do guard de projeção em clone do schema de Produção — 30/09/2026

- Antes do teste, a branch preview `xpyvjchcrnvprvwgjibm` foi consultada em transação `READ ONLY`: `transaction_read_only=on`, 127 migrations no ledger até `20260927220141`, zero linhas em `legacy_records`, `maestro_jobs` e `maestro_timesheets`, e uma organização-base. A branch é derivada de Produção sem dados (`with_data=false`), está em `MIGRATIONS_FAILED` no controle de Branching e não representa um snapshot de dados nem o catálogo mais recente integral.
- Na mesma transação foi aplicada a migration local `20260930170000_reject_cross_tenant_core_projection_references`, inseridos fixtures sintéticos para duas organizações e executados os casos da suíte SQL: Project→Client cruzado, Job→Client cruzado e Job→Project cruzado foram rejeitados com os erros esperados; Project→Client same-tenant foi projetado com UUID tipado; referência histórica sem parent correspondente foi aceita preservando `client_legacy_record_id` e `client_id=NULL`.
- A transação terminou com `ROLLBACK`. A consulta de confirmação posterior foi `READ ONLY`: zero organizações/legacy_records/Projects/Jobs fixture, o corpo anterior de `maestro_sync_relational_work_core()` restaurado (guard não persistido) e ledger ainda em 127/`20260927220141`.
- Resultado: comportamento da migration validado no perfil de schema de Produção em cenário sintético rollback-only. Isso reduz o risco funcional específico do trigger, mas não é upgrade representativo, não valida os dados atuais, não cria as sete constraints tenant-aware ausentes na Produção e não substitui a classificação completa de migrations. Não aplicar migration em Produção com base apenas neste teste.

## Reparo de timesheets em clone do schema de Produção — 30/09/2026

- No mesmo preview sem dados (`xpyvjchcrnvprvwgjibm`), a migration local `20260930140000_repair_timesheet_payload_projection` foi executada duas vezes em uma transação com quatro fixtures sintéticas. As asserções passaram para conversões válidas, duração fora do limite/timestamps inválidos, validade parcial e preservação de valores tipados já existentes.
- `ROLLBACK` removeu a migration aplicada apenas para o teste e todas as fixtures. Consulta posterior `READ ONLY` confirmou `transaction_read_only=on`, zero organização/timesheet de fixture e ledger inalterado em 127 entradas/`20260927220141`.
- Isso valida compatibilidade SQL e casos-limite em tabela existente no perfil de schema derivado de Produção, não o backfill sobre as 8.938 linhas reais nem o upgrade combinado da sequência reconciliada. O preview continua sem dados e com status `MIGRATIONS_FAILED`; nenhuma alteração foi feita na Produção.

## Teste DDL das constraints core após simular ausência — 30/09/2026

- A comparação read-only mostrou que o preview de Produção não é um clone fiel do catálogo atual: o preview tinha as sete constraints core presentes e validadas, além de FKs compostas dependentes em histórico/timesheets; o projeto Produção ainda tinha zero das sete. Portanto a primeira execução idempotente da migration `20260927030000_add_tenant_aware_core_foreign_keys.sql` no preview não exercitou sua criação e não é usada como prova de DDL.
- Para cobrir o caminho de criação, numa transação rollback-only do preview removi temporariamente as sete constraints-alvo, os FKs dependentes de Job para histórico/timesheets e os quatro índices-alvo; rodei a migration real e validei: 3 uniques tenant-aware válidas, 4 FKs tenant-aware criadas `NOT VALID` e 4 índices presentes. Com duas organizações e dois Clients sintéticos, uma relação nova Project→Client cross-tenant foi rejeitada por FK e a mesma relação same-tenant foi aceita.
- `ROLLBACK` restaurou o estado anterior. Consulta posterior `READ ONLY` confirmou as sete constraints e quatro índices preexistentes, os dois FKs dependentes, zero fixtures, e ledger inalterado (127 / `20260927220141`). A Produção real permaneceu somente leitura.
- Isso prova o caminho de criação e enforcement de novas escritas da migration em um preview sem dados após simulação controlada de ausência; não valida constraints contra registros reais, nem o perfil completo da Produção. O fato de o preview diferir do parent reforça a necessidade de clone representativo antes do upgrade e de qualquer corte.

## Classificação read-only do sufixo local não-CXM — 30/09/2026

Probes agregados do catálogo de Produção foram feitos em `BEGIN READ ONLY`, sem retornar corpos de funções, payloads ou dados de negócio:

| Migration local | Efeito observado em Produção | Classificação operacional |
|---|---|---|
| `20260929220702_task_audit_log_scope_from_row_org_id` | `maestro_sync_task_audit_log()` existe e lê `organization_legacy_records`, mas o corpo não usa `NEW.organization_id`, que a migration local prioriza. | Efeito **pendente**; scope pode depender do mapa legado em vez da linha fonte. |
| `20260929224533_resolve_job_task_reconciliation_exact_match` | A RPC existe como `SECURITY DEFINER` com `search_path=public`; a migration local define `SECURITY INVOKER`, `search_path` vazio e exige exatamente uma atualização de tarefa e de fila. | **Conflito de segurança/semântica**; preservar EXECUTE restrito e provar transições atômicas antes de qualquer substituição. |
| `20260929232021_mode_aware_legacy_cutover_health` | A view existe e expõe `read_mode`, `write_mode` e `health_status`, mas não as colunas direcionais `legacy_only_count`/`relational_only_count` esperadas pelo arquivo local. | Efeito **parcial/anterior**; o gate local completo ainda não está demonstrado. |
| `20260930012652_timesheet_admin_atomic_relational_operations` | As RPCs `maestro_delete_timesheets_with_audit` e `maestro_reset_running_timesheets` não existem no catálogo consultado. | Efeito **pendente** em Produção. |
| `20260930022408_harden_job_history_tenant_scope_and_trigger` | O trigger de `maestro_sync_relational_job_history()` existe, mas a função é `SECURITY DEFINER`, `search_path=public`; a versão local é `SECURITY INVOKER`, `search_path` vazio, com validação tenant-aware. | **Conflito de hardening/efeito pendente**. |
| `20260930140000_repair_timesheet_payload_projection` | Ledger ausente; consulta agregada anterior encontrou 8.938 linhas elegíveis. Teste sintético repetido passou no preview de schema de Produção sem dados. | Migration **pendente**; backfill real não foi feito. |
| `20260930160000_reinforce_cxm_silence_due_tenant_scope` | Migration CXM. | **Excluída** da sequência não-CXM por limite de produto. |
| `20260930170000_reject_cross_tenant_core_projection_references` | Guard não existe na função de Produção; teste transacional passou no preview. | Migration **pendente** no catálogo Produção; teste não equivale a aplicação no parent. |

Na consulta read-only de Dev, o health view, resolver e task-audit function acima não existiam; a função de JobHistory tinha `SECURITY INVOKER`/`search_path` vazio e um trigger; as duas RPCs de timesheet também estavam ausentes, assim como o guard cross-tenant. Isso confirma que Dev não representa a superfície Production para esse sufixo. A classificação cobre apenas estas oito migrations de maior prioridade, não as 173 migrations da matriz; não libera upgrade ou release.

## Clone local do schema de Produção e ensaio direcionado não-CXM — 30/09/2026

- Foi gerado um dump somente do schema `public` do projeto de Produção `fwpisypiiezjhtqxlmqv`; inspeção automatizada não encontrou instruções `COPY` nem `INSERT INTO`. O arquivo ficou em diretório temporário fora do repositório. Foi restaurado num banco descartável, sem dados de negócio, com um stub local de `auth.uid()` para testes RLS.
- A comparação agregada do catálogo entre Produção e o clone coincidiu: 56 tabelas, 2 views, 33 funções, 19 triggers, 228 constraints, 136 policies e 56 tabelas com RLS. Igualdade de contagens não equivale a comparação semântica de cada objeto.
- No clone foram aplicadas oito migrations selecionadas do sufixo não-CXM. A migration `20260930160000_reinforce_cxm_silence_due_tenant_scope` ficou deliberadamente excluída. Foram verificadas as constraints tenant-aware, RPCs, view, auditoria/histórico e guard do trigger. As relações de negócio verificadas continuaram sem linhas.
- Testes sintéticos com `ROLLBACK` passaram para relações entre tenants, RPCs privilegiadas, projeção de auditoria/histórico, operações de timesheet e leitura RLS alternando duas identidades. Fixtures e grant temporário foram revertidos. O stub Auth é exclusivo do clone.
- Cobertura direcionada, não replay integral nem matriz completa de reconciliação. Não cobre dados reais, runtime completo do Supabase, Auth/Storage/cron/Edge hospedados, upgrade remoto, backfill ou cutover. Dev e Produção não foram escritos. Nada aqui autoriza `db push`, `migration repair` ou deploy.

## Ensaio local de upgrade derivado do preview — 30/09/2026 (revalidado)

- O preview Supabase `xpyvjchcrnvprvwgjibm` foi consultado sem escrita. O ledger contém 127 entradas até `20260927220141`; `supabase db push --dry-run --skip-vault` parou antes de executar migrations porque o CLI encontrou versões remotas ausentes localmente (`LegacyDbPushMissingLocalError`). Nenhum `migration repair` foi executado.
- A comparação foi refeita diretamente sobre as 127 linhas atuais do ledger pelo endpoint read-only da CLI, calculando fingerprints localmente sem imprimir SQL. Para os 173 arquivos locais, o resultado é: 7 identidades/conteúdos iguais; 5 identidades iguais com SQL diferente; 107 conteúdos iguais sob outra identidade/versão; 54 conteúdos locais sem fingerprint remoto (16 até a versão máxima do ledger e 38 depois dela); 43 arquivos locais posteriores ao máximo (cinco deles têm conteúdo já representado); e 13 conteúdos remotos sem arquivo local. As categorias se sobrepõem e não devem ser somadas. **Esta revalidação corrige os números 11/8 registrados na primeira anotação desta seção.**
- Os 16 conteúdos locais sem equivalente até o máximo remoto são: `0004/publish_imported_records`, `20260910100000/enable_whatsapp_automation_scheduler`, `20260915090000/create_marketing_mix_observations`, `20260917011128/create_dominus_learning_and_audits`, `20260926004418/cxm_webhook_durable_queue`, `20260926005052/cxm_webhook_environment_scoped_cron`, `20260926250000/create_reconciliation_resolution_rpc`, `20260926290000/scope_cxm_collaboration_tables`, `20260927005839/ads_brain_server_sync_scheduler`, `20260927014950/revoke_client_access_from_server_managed_tables_complete`, `20260927023629/bootstrap_dominio_tenant`, `20260927051730/prevent_legacy_organization_reassignment`, `20260927052331/scope_project_schedule_patch`, `20260927053724/cxm_silence_due_jobs_tenant_scope`, `20260927063559/protect_notification_tenant_references` e `20260927204529/enforce_remaining_tenant_relationships`.
- Os 13 conteúdos remotos sem equivalente local são: `20260927023302/branch_empty_base44_import_guard`, `20260927023655/create_marketing_mix_observations`, `20260927023658/create_dominus_learning_and_audits`, `20260927024203/create_reconciliation_resolution_rpc`, `20260927024310/scope_cxm_collaboration_tables`, `20260927024831/revoke_client_access_from_server_managed_tables_complete`, `20260927024910/bootstrap_dominio_tenant`, `20260927025006/cxm_webhook_durable_queue_schema_only_branch`, `20260927051730/prevent_legacy_organization_reassignment`, `20260927052331/scope_project_schedule_patch`, `20260927053724/cxm_silence_due_jobs_tenant_scope`, `20260927063559/protect_notification_tenant_references` e `20260927204529/enforce_remaining_tenant_relationships`.
- Primeira classificação de efeito, baseada nos nomes e nos primeiros tokens/operações SQL (sem expor o SQL remoto): (a) **CXM, manter fora do pacote não-CXM** — webhook/cron e fila CXM; (b) **side effects externos, manter em quarentena** — schedulers WhatsApp e Ads Brain (`pg_cron`/`pg_net`/Vault); (c) **segurança/tenant, prioridade alta para comparação do catálogo** — revogações de grants, bootstrap de tenant, imutabilidade de tenant, patch de agenda, referências de notificação e constraints/índices tenant-aware; (d) **schema/rotas de produto** — `legacy_records`, Marketing Mix, Dominus learning/audit, RPC de reconciliação e colaboração. A classificação é inicial: não substitui comparar cada statement completo, dependências, owners/ACLs e consumidores.
- Foi exportado e restaurado localmente um dump de schema, sem dados, em banco descartável. O schema público de origem tinha 58 tabelas, 86 FKs (zero não validadas), RLS habilitado nas 58 e 135 policies; não havia linhas nas tabelas públicas de negócio. O clone local preservou esse catálogo antes do ensaio.
- Em uma segunda cópia local isolada foram aplicados, diretamente via `psql`, 42 de 43 arquivos com versão acima do máximo do ledger do preview. Todos os 42 foram executados sem erro; a migration restante, `20260927232653_reconcile_environment_scoped_cron_jobs.sql`, foi excluída porque altera cron/Vault e agenda chamadas HTTP externas. Depois, a cópia candidata apresentou 66 tabelas, 103 FKs, zero FKs não validadas, RLS nas 66 tabelas e 135 policies. A suíte `scripts/sql/tenant-isolation-ci.test.sql` passou e terminou em `ROLLBACK`; a auditoria `scripts/sql/audit_core_tenant_integrity.sql` terminou em `ROLLBACK`, encontrou as sete constraints core tenant-aware presentes/validadas e zero inconsistências nas quatro relações core. A confirmação posterior encontrou zero fixtures residuais.
- Este é um **ensaio parcial de compatibilidade DDL** sobre snapshot somente-schema derivado de preview, e não um upgrade completo do histórico Supabase: os migrations anteriores não pareados e os pares de mesmo identificador com SQL divergente não foram reproduzidos em ordem. Não foi aplicado ledger local nem executada a sequência pelo CLI; não há dados de tenants para provar backfill ou integridade histórica. A falha de `db push --dry-run` e o status `MIGRATIONS_FAILED` do preview permanecem bloqueios.
- Nenhuma migration, DDL ou DML foi enviada a Produção, Dev ou preview Supabase nesta rodada; consultas remotas foram `SELECT` apenas. O clone/candidato usado no ensaio foi exclusivamente local. Não executar `migration repair`, `db push` ou alteração remota até classificar e reproduzir o histórico integral em cópia representativa, com fixtures/dados anonimizados para backfills, e revisar cron/Vault em plano separado.

### Verificação read-only do catálogo do preview e impacto

- Uma consulta somente `SELECT` ao catálogo do preview confirmou os seguintes efeitos presentes: `legacy_records`, Marketing Mix, tabelas Dominus learning/audit, tabelas de colaboração, `job_task_reconciliation`, fila CXM e `cxm_silence_due_jobs`. As relações listadas tinham RLS habilitado; exceto `organization_members`, consultada como referência, as tabelas listadas não tinham policies de cliente. Isso indica acesso de cliente bloqueado por política e/ou grants, não comprova isolamento completo dos caminhos privilegiados.
- Grants efetivos consultados para os papéis `anon`, `authenticated` e `service_role`: os dois papéis de cliente não tinham CRUD nas seis relações verificadas; `service_role` tinha CRUD em `legacy_records`, SELECT/INSERT/UPDATE em `dominus_learning_reviews`, SELECT em Marketing Mix e `team_chat_channels`, e nenhum CRUD em `job_task_reconciliation` ou `cxm_webhook_event_receipts`. Esses resultados são restritos à lista consultada; não extrapolar para todas as tabelas.
- A função `resolve_job_task_reconciliation` está presente como `SECURITY DEFINER`, `search_path=public`, mas sem EXECUTE efetivo para `anon`, `authenticated` ou `service_role`. A versão no arquivo local é `SECURITY INVOKER` com `search_path` vazio. A função `create_organization_tenant` é `SECURITY DEFINER`/`search_path=public`, EXECUTE somente para `service_role`; falta validar owner e CREATE no schema `public` antes de aprovar esse padrão. `maestro_patch_project_schedule_scoped` é `SECURITY INVOKER`/`search_path` vazio, EXECUTE somente para `service_role`. O trigger de imutabilidade de organização em `legacy_records` e o trigger de validação de referências tenant-aware das notificações estão presentes.
- `pg_net` e `pgmq` estão instaladas; `pg_cron` não está instalada no preview observado. Portanto, migrations/schedulers locais de Ads Brain e WhatsApp não podem ser tratados como já aplicados só por estarem no checkout. Não se leu comando agendado, segredo, payload ou conteúdo de negócio.
- Conclusão de efeito: parte substancial do conteúdo remoto sem equivalente local tem objetos correspondentes no catálogo, mas **isso não reconcilia a história**. Há diferenças materiais de função/segurança e incerteza sobre grants/default ACLs, autoria e consumidores. `resolve_job_task_reconciliation` é um conflito de segurança/semântica pendente; não habilitar seu EXECUTE nem substituir a função sem teste de autorização e atomicidade. Nenhum SQL de escrita foi executado em preview ou Produção.

### Correção e prova local do RPC invoker — 01/10/2026

- Uma chamada efetiva de `resolve_job_task_reconciliation` sob `SET LOCAL ROLE service_role` no clone local falhou com `permission denied for table job_task_reconciliation`, apesar do verificador confirmar `SECURITY INVOKER`, `search_path` vazio e EXECUTE restrito. Metadados de segurança não bastam: o invoker precisa dos privilégios subjacentes.
- Migration aditiva `20260930180000_fix_reconciliation_invoker_privileges.sql` concede somente SELECT em `id`, `organization_id`, `legacy_record_id`, `resolution_status` e UPDATE em `resolution_status`, `resolved_job_id`, `resolution_note`, `resolved_at`, `resolved_by`. A RPC seleciona apenas as colunas autorizadas e serializa chamadas concorrentes por advisory transaction lock, sem `SELECT FOR UPDATE` que exigiria privilégio de tabela. Mantém `SECURITY INVOKER`, `search_path` vazio e EXECUTE exclusivo do `service_role`.
- `verify-tenant-foundation.mjs` verifica o conjunto exato de grants e rejeita privilégios de tabela. `tenant-isolation-ci.test.sql` executa a RPC sob o papel real: alvo cross-tenant rejeitado, vínculo válido único aceito, repetição rejeitada e atualização pareada da tarefa/fila confirmada.
- Banco local `maestro_upgrade_candidate_20261001`, derivado do preview sem dados de negócio; migration aplicada como `supabase_admin`. Teste SQL terminou em `ROLLBACK`; auditoria tenant-aware terminou em `ROLLBACK`; verificadores de fundação e isolamento retornaram `status=ok`; zero fixtures residuais. O CI `36804599176` passou: replay clean-room, lint do schema, regressão RLS/tenant, testes Node/build e scanners.
- A prova corrige a definição candidata local, mas não resolve a diferença observada no catálogo remoto do preview (`SECURITY DEFINER`/`search_path=public`, EXECUTE revogado) nem autoriza substituição, migration repair ou escrita remota. Produção, Dev e preview não foram escritos.

### Revalidação atual do ledger e catálogo hospedado — 30/09/2026

- Checkout na branch depois de `79b7bdb`: 174 migrations locais; ledger Dev 83; ledger Produção 111. Consultas identificaram refs esperadas, confirmaram `transaction_read_only=on` e fizeram `ROLLBACK`. A contagem anterior desta seção (173) é histórica.
- Resultado de fingerprints Dev — 22 identidade+conteúdo iguais; 9 mesmos pares com conteúdo divergente; 45 mesmo nome/outra versão com conteúdo igual; 6 mesmo nome/outra versão com conteúdo divergente; 0 mesmo conteúdo/outro nome; 98 arquivos locais sem conteúdo no ledger; 16 conteúdos remotos sem arquivo local. Produção — 15, 2, 60, 23, 10, 87 e 26, respectivamente. A nova migration `20260930180000` está entre os arquivos locais sem fingerprint nos dois ledgers. As categorias se sobrepõem; não representam quantidades cumulativas de migrations.
- Conflitos de identidade iguais atuais: Dev `0004/publish_imported_records`, `20260910100000/enable_whatsapp_automation_scheduler`, `20260923151011/persist_job_project_mutations_with_audit`, `20260923155416/restrict_rls_event_trigger_rpc`, `20260926004418/cxm_webhook_durable_queue`, `20260926005052/cxm_webhook_environment_scoped_cron`, `20260926005755/cxm_webhook_synthetic_test_gate`, `20260926235437/revoke_client_access_from_server_managed_tables`, `20260928031940/cxm_silence_due_jobs_organization_scope`; Produção tem os dois primeiros. Esses fingerprints requerem classificação individual, não repair automático.
- Nova ferramenta repetível `scripts/audit-migration-conflict-catalog.mjs` coleta somente metadados: assinatura/configuração/grants de funções selecionadas, RLS/grants/policies nos alvos core e nas 33 tabelas citadas pela migration de policies, event triggers, ownership no registry e nome/agenda/estado de jobs cron. Para cron só registra SHA-256 do comando, nunca o texto. Executada em ambas as refs esperadas sob transação somente leitura.
- A RPC `resolve_job_task_reconciliation` está ausente em Dev. Em Produção está presente como `SECURITY DEFINER`, `search_path=public`, EXECUTE não concedido a `anon`/`authenticated` e concedido a `service_role`. Isso corrige evidência anterior que indicava nenhum EXECUTE para os papéis consultados: o estado atual confirma `service_role`. A migration local candidata mantém invoker e grants mínimos por coluna; ainda não está nos ledgers nem instalada remotamente. Resultado: **Dev ausente; Produção em definição antiga; alteração hospedada continua vedada até upgrade isolado representativo**.
- O event trigger `ensure_rls` que chama `rls_auto_enable()` está ativo somente em Dev. A função não concede EXECUTE efetivo aos papéis verificados. Produção não tem esse event trigger nem a função. A migration `restrict_rls_event_trigger_rpc` revoga EXECUTE, mas não desativa/remove o trigger. Diferença de alto impacto potencial para DDL futuro: investigar o efeito em clone descartável antes de qualquer harmonização; não executar DDL nos projetos hospedados.
- RLS está habilitado e não forçado em `maestro_clients`, `maestro_projects`, `maestro_jobs` e `maestro_job_tasks` em ambos. Produção tem quatro policies por tabela (16); Dev não tem policies nessas quatro. Os papéis `anon` e `authenticated` não têm SELECT de tabela efetivo em nenhum dos dois; `service_role` tem DML de tabela nas duas instalações. O drift de policies é comprovado, mas não prova isoladamente uma falha explorável nem a quebra do fluxo: faltam grants por coluna e um teste pelo caminho real da aplicação/roles. Proteger os usos privilegiados continua dependendo das funções e Edge Functions tenant-aware.
- O cron `whatsapp_automation_runner` está ativo `*/5 * * * *` em ambos, com fingerprints de comando diferentes. `cxm_webhook_queue_runner` está ativo `* * * * *` somente em Dev. Não foram revelados comandos, URLs ou credenciais. Isso confirma diferença operacional CXM e mantém esses objetos fora do pacote não-CXM.
- `maestro_apply_legacy_mutation` tem assinatura, `SECURITY INVOKER`, `search_path` vazio e padrão de EXECUTE igual nos dois catálogos: somente `service_role` dentre os papéis consultados. Essa verificação de metadados não substitui comparação do corpo SQL.
- **Causa do delta de policies e fronteira de produto:** `20260926520000_add_authenticated_organization_rls.sql` não tem fingerprint no ledger Dev; Produção registra o mesmo conteúdo sob `20260926225258/add_authenticated_organization_rls`. Dos 33 alvos explícitos, Produção tem as 33 relações e 132 policies (4/tabela); Dev tem só 9 relações e nenhuma policy. As 24 tabelas ausentes em Dev incluem entidades operacionais e tabelas WhatsApp/CXM. O SQL atual não testa a existência das relações antes de executar `CREATE POLICY`, então reproduzir o arquivo integral em Dev falharia na primeira relação ausente; não é seguro `db push`/replay manual.
- O `legacy_cutover_registry` classifica 21 dos 33 alvos em Produção (15 `maestro`, 4 `cxm`, 2 `insights`), mas apenas 4 em Dev (todos `maestro`). Doze tabelas-alvo não têm dono registrado nem mesmo na Produção. Isto é uma lacuna confirmada no mapa de ownership, não prova de que essas tabelas não tenham consumidores; mapear e decidir esses 12 antes de dividir a migration. O arquivo de policies mistura produtos, portanto fica fora de qualquer pacote exclusivamente não-CXM até separar grupos por ownership e disponibilidade de schema.
- Limites da coleta de catálogo: amostral; não cobre defaults, todos os grants/colunas, todos os objetos, consumers, Edge Functions, dados, Vault, Auth ou Storage. Não houve replay/upgrade integral. Os ensaios de roles/event trigger abaixo são rollback-only e focados; nenhum banco remoto foi alterado.
- Próximas ações seguras para fechar a classificação: (1) mapear os 12 alvos sem dono e resolver a classificação dos 33 antes de segmentar a migration; (2) auditar contratos de chamadas reais Edge e confirmar ausência de impacto do drift de policies; (3) decidir manter/remover o `ensure_rls` só depois de testar criação de tabela com contratos reais em clone; (4) testar a RPC ausente/antiga em schema de Produção, sem harmonização remota; (5) continuar classificação statement-a-statement dos 9/2 conflitos de identidade e conteúdo remoto/local órfão; (6) obter clone com dados representativos anonimizados para backfills e upgrade. Marco 4 permanece parcial.

### Testes locais rollback-only das policies e do gatilho — 30/09/2026

- Confirmada a origem/escopo do container local `maestro-clean-room.xjrrql` pelos labels do Docker (`/tmp/maestro-clean-room.xjrrql`) e pelo banco `maestro_prod_schema_snapshot_20260930`. Leitura inicial `READ ONLY`: 58 relações públicas; as relações core necessárias existiam; organizações, colaboradores, vínculos e tabelas core estavam vazias; os event triggers globais não estavam presentes. O snapshot continua intacto depois dos ensaios.
- `scripts/sql/test_core_tenant_policies_clone.sql` inseriu fixtures sintéticas para dois tenants ativos e um membro suspenso, concedeu SELECT/INSERT temporários à role `authenticated`, e testou com `auth.uid()`/JWT claims: cada tenant viu somente o próprio cliente; membro suspenso viu zero; INSERT cross-tenant foi rejeitado; leitura de memberships ficou limitada ao próprio vínculo. O teste terminou em `ROLLBACK`; consulta seguinte confirmou IDs ausentes.
- `scripts/sql/test_dev_ensure_rls_event_trigger_clone.sql` recriou no clone, apenas em transação, a função/event trigger exatos observados em Dev. Ao criar tabela pública sintética, RLS ficou habilitado, nenhuma policy foi criada, e `authenticated` com SELECT temporário leu zero linhas (default-deny). O teste terminou em `ROLLBACK`; function, trigger e tabela de teste foram confirmados ausentes depois.
- **Classificação refinada:** a falta de policies no Dev não é fail-open: com RLS ativo, a ausência de policies nega o acesso direto. No catálogo atual `authenticated` nem sequer tem SELECT de tabela. Para novos objetos públicos criados por DDL privilegiado, o `ensure_rls` aplica RLS sem policies; isso tende ao bloqueio do acesso direto, não a exposição, mas pode interromper novos fluxos que esperem Data API. Como o frontend atual usa Edge Functions conforme a migration preparatória de RLS, não há prova de impacto funcional imediato; falta um teste de caminho Edge real. A diferença continua relevante para compatibilidade de futuros DDL.
- Os scripts são ensaios direcionados em schema sem dados, não provam replay/upgrade completo ou o comportamento dos usos reais da aplicação. A função foi copiada do catálogo Dev para o clone; não houve DDL nem alteração em projetos hospedados. CI não executa o ensaio de event trigger, que requer role superuser; replay clean-room geral já passou no workflow `36805954490`.
- Ciclo de aprendizado: após a reprodução controlada do desvio, a skill `dominio-database-migrations` foi atualizada para exigir inventário separado de `pg_event_trigger` e reprodução de hooks globais em clone. Evidência registrada aqui: Dev tem o trigger ativo, o snapshot público de Produção não o continha e o ensaio confirmou seu efeito em DDL. É uma melhoria de método; não reconcilia os ambientes.
