# Reconciliação read-only dos ledgers de migrations

Auditado em 30/09/2026 contra o checkout da branch `codex/maestro-db-canonical-candidate`, commit `5013fa3a`. Nenhum `db push`, `migration repair`, alteração de catálogo ou DDL remoto foi executado.

## Método e limites

- Arquivos locais: 172 migrations em `supabase/migrations` nesta branch.
- Ledgers consultados em transação PostgreSQL `READ ONLY`, confirmada como `on`, depois de validar a ref da conexão: Dev `tqmfuskvllpqmvayjuqu`; Produção `fwpisypiiezjhtqxlmqv`.
- Comparação usa sequência de statements tokenizada: terminadores, comentários e espaços não afetam fingerprint; strings, identificadores quoted e corpos dollar-quoted são preservados.
- O relatório guarda identidades e contagens, não SQL remoto, URL, credenciais nem dados de negócio.
- Fingerprint igual comprova conteúdo SQL normalizado igual no ledger; não comprova que os catálogos atuais sejam iguais. Fingerprint diferente não prova, sozinho, se a diferença é segura ou material.

## Resumo

| Ambiente | Ledger remoto | Par versão/nome e SQL igual | Par exato com SQL diferente | Mesmo nome, outra versão: SQL igual | Mesmo nome, outra versão: SQL diferente | Conteúdo local sem equivalente no remoto | Conteúdo remoto sem equivalente local |
|---|---:|---:|---:|---:|---:|---:|---:|
| Dev | 83 | 22 | 9 | 47 | 4 | 90 | 14 |
| Produção | 111 | 16 | 1 | 74 | 9 | 62 | 11 |

Produção contém 10 fingerprints com alias em outra identidade/versão local, além das categorias exibidas. Dev não mostrou alias nesse cálculo. Esses totais medem correspondência entre arquivos e ledger, não progresso de execução do schema.

## Mesmo par versão/nome, SQL divergente

| Ambiente | Migrations |
|---|---|
| Dev | `0004/publish_imported_records`; `20260910100000/enable_whatsapp_automation_scheduler`; `20260923151011/persist_job_project_mutations_with_audit`; `20260923155416/restrict_rls_event_trigger_rpc`; `20260926004418/cxm_webhook_durable_queue`; `20260926005052/cxm_webhook_environment_scoped_cron`; `20260926005755/cxm_webhook_synthetic_test_gate`; `20260926235437/revoke_client_access_from_server_managed_tables`; `20260928031940/cxm_silence_due_jobs_organization_scope` |
| Produção | `20260910100000/enable_whatsapp_automation_scheduler` |

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

### Dev — 90 migrations

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
```

### Produção — 62 migrations

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
