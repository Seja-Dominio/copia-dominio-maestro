# Dominus — Etapa 3: memória aprovada e auditoria

## Decisão aprovada

O Dominus não altera os próprios pesos, prompts críticos ou permissões. Ele
propõe aprendizados, mas somente uma aprovação explícita do Master transforma a
proposta em regra permanente.

```text
Interação → candidato de aprendizado → revisão do Master → DominusMemory
```

Dados operacionais continuam sendo consultados no Maestro. Métricas, status,
atrasos e saldos não entram como memória permanente.

## Estruturas criadas

| Estrutura | Finalidade |
|---|---|
| `dominus_learning_reviews` | Aprendizados pendentes, aprovados, editados ou rejeitados |
| `dominus_memory` | Regras aprovadas, versionadas e reversíveis |
| `dominus_audit_runs` | Execuções de auditoria do sistema |
| `dominus_audit_findings` | Achados com evidência, gravidade e ação sugerida |

Todas as tabelas possuem RLS habilitado e acesso direto revogado para `anon` e
`authenticated`. O acesso deverá ocorrer por Edge Function com autorização
Master.

## Memória no gateway

O `dominus-webhook` passou a ler somente regras ativas de `dominus_memory` com
escopo compatível:

- agência;
- grupo;
- usuário identificado.

Perguntas e respostas deixam de ser promovidas automaticamente para memória.
O histórico curto continua existindo apenas para continuidade da conversa.

## Auditorias planejadas

O motor de auditoria deverá identificar, no mínimo:

- briefings vazios ou insuficientes;
- Jobs ativos sem subtasks;
- subtasks concluídas com Job ainda aberto;
- Jobs concluídos com subtasks pendentes;
- indicadores que não fecham com os registros de origem;
- dados ausentes ou órfãos;
- sincronizações desatualizadas;
- gargalos por etapa, responsável e cliente.

O Dominus explicará e priorizará os achados, mas não corrigirá dados
automaticamente nesta etapa.

## Verificação

- migration validada em transação temporária no ambiente de desenvolvimento;
- quatro tabelas criadas na validação;
- RLS confirmado nas quatro tabelas;
- build do aplicativo aprovado;
- `git diff --check` aprovado;
- Edge Function `dominus-memory` criada com autorização Master;
- Edge Function `dominus-audit` criada para execução manual pelo Master ou chamada interna com segredo de cron;
- auditoria conectada ao agendador existente do WhatsApp, com trava de uma execução por dia;
- resumo diário formatado sem JSON e enviado somente ao grupo de resumo selecionado no sistema, no ciclo das 20:00 em `America/Manaus` (com tolerância até 20:10);
- aprovação de aprendizados permanece exclusivamente no painel do sistema; o WhatsApp apenas recebe o resumo aprovado pelo fluxo automático;
- seleção do grupo de destino do resumo adicionada à configuração do Dominus;
- índice da referência de revisão da memória adicionado após validação de performance;
- painel `Aprendizados do Dominus` adicionado às Configurações do Master;
- migrations aplicadas em Dev e Prod;
- Edge Functions atualizadas em Dev e Prod;
- build de produção publicado no KVM2, com gzip habilitado no Nginx;
- domínio Prod validado com HTTP 200 e bundle JavaScript servido com `Content-Encoding: gzip`.

## Próxima etapa

Executar o teste funcional com um usuário Master, selecionar o grupo de resumo
no sistema e acompanhar o primeiro ciclo automático das 20h em `America/Manaus`.
