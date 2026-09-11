# Planejamento — Marketing Mix Modeling no Maestro

Status: proposta v0.1

## 1. Decisões já tomadas

- Público inicial: uso interno da agência, com múltiplos clientes.
- Entrada de mídia: integrações automáticas com Meta Ads e Google Ads.
- Resultado otimizado: KPI configurável por cliente.
- Escopo desejado: produto completo, com conectores, atualização automática e portal dentro do Maestro.

## 2. Visão do produto

Criar no Maestro um módulo de Marketing Mix Modeling (MMM) que permita à agência:

1. conectar fontes de mídia e fontes de resultado de cada cliente;
2. manter uma série histórica confiável, auditável e atualizada;
3. estimar baseline e contribuição incremental dos canais;
4. mostrar incerteza, efeito ao longo do tempo, saturação, ROI e retorno marginal;
5. simular cenários e sugerir uma alocação de orçamento sujeita a restrições reais;
6. registrar hipóteses, experimentos e decisões para melhorar os modelos seguintes.

A referência funcional é a Purple Metrics: mensuração conjunta de branding e performance, inclusão de ações sem clique ou sem investimento, efeitos ao longo do tempo, atualização recorrente e otimização de budget.[1][2]

## 3. Princípios

- Decisão, não apenas dashboard: cada resultado deve levar a uma ação, cenário ou experimento.
- Incerteza visível: apresentar intervalos de credibilidade e qualidade do modelo, não apenas números pontuais.
- Rastreabilidade: qualquer resultado deve apontar para snapshot de dados, configuração, versão do código e execução que o produziu.
- Separação entre correlação e causalidade: calibração por experimentos deve ser suportada; o sistema não deve vender toda associação como efeito causal.
- Multi-cliente desde o banco: nenhuma tabela, arquivo, execução ou segredo sem `organization_id` e `client_id` quando aplicável.
- Modelagem fora do navegador: o frontend apenas configura, dispara e lê resultados.

## 4. Leitura do Maestro atual

O repositório atual indica:

- frontend React 18 + Vite, TanStack Query, Recharts e React Router;
- migração gradual de Base44 para Supabase;
- dados ainda preservados principalmente em `public.legacy_records`, como payload JSON;
- acesso ao Supabase mediado pela Edge Function `maestro-data`;
- navegação e permissões baseadas em `master`, `gestor` e `collaborator`;
- módulo de Instagram já organizado por cliente, que pode inspirar a navegação do MMM.

Consequência arquitetural: o MMM não deve ser implementado como novas entidades genéricas em `legacy_records`. Modelos, séries temporais, credenciais, execuções e resultados precisam de tabelas relacionais próprias, índices, RLS, versionamento e APIs dedicadas.

Também não é recomendável executar treinamento estatístico dentro de uma Supabase Edge Function: o processo pode ser longo, consumir muita memória e depender de bibliotecas científicas Python. Edge Functions devem autenticar, validar e enfileirar; um worker Python deve preparar dados e treinar os modelos.

## 5. Arquitetura proposta

### 5.1 Camadas

1. Portal Maestro — React/Vite
   - carteira de clientes;
   - saúde dos dados;
   - configuração do modelo;
   - resultados, cenários, recomendações e histórico.

2. Control plane — Supabase/Postgres
   - configuração por cliente;
   - metadados dos conectores;
   - snapshots normalizados;
   - fila e estado das execuções;
   - resultados tabulares;
   - RLS, auditoria e permissões.

3. API dedicada — Supabase Edge Functions
   - OAuth de Meta e Google;
   - criação de jobs;
   - leitura segura de resultados;
   - validação de escopo por cliente e por perfil.

4. Data workers — Python
   - backfill e sincronização incremental;
   - normalização de campanhas, contas, moedas e fusos;
   - reconciliação, deduplicação e controles de qualidade.

5. Model worker — Python
   - preparação da matriz do modelo;
   - treinamento Bayesiano;
   - diagnósticos e validação temporal;
   - decomposição, curvas de resposta e otimização;
   - persistência de artefatos e resultados.

6. Scheduler/queue
   - sincronizações diárias;
   - agregação semanal;
   - retreino sob demanda e agendado;
   - retry com backoff, idempotência e dead-letter queue.

7. Object storage
   - snapshots, relatórios, gráficos exportados e artefatos serializados;
   - caminhos versionados por cliente e por `model_run_id`.

### 5.2 Motor de modelagem

Recomendação inicial: PyMC-Marketing como motor principal, encapsulado por uma interface própria do Maestro.

Motivos:

- API Python adequada à infraestrutura proposta;
- modelo Bayesiano com adstock, saturação, controles, sazonalidade e dimensões adicionais;
- suporte a calibração e otimização de orçamento;
- flexibilidade para evoluir depois para variáveis intermediárias e modelos específicos por vertical.[4]

A interface própria deve permitir testar Google Meridian em paralelo. Meridian também é Bayesiano, modela lag e saturação, suporta dados por geografia, reach/frequency, calibração e planejamento.[3] Meta Robyn deve entrar como benchmark alternativo, não como base principal, por introduzir dependência de R e um fluxo operacional diferente.[5]

Decisão técnica: não tentar reproduzir de início uma rede Bayesiana proprietária igual à Purple. A primeira versão produtiva deve usar um MMM Bayesiano auditável e validado; efeitos indiretos entram em uma evolução posterior, quando houver dados intermediários e critérios de identificação suficientes.

## 6. Escopo funcional

### 6.1 Onboarding por cliente

- selecionar cliente já existente no Maestro;
- definir moeda, fuso, calendário e granularidade;
- cadastrar KPI principal e unidade: receita, vendas, leads, matrículas, downloads ou outro;
- configurar fonte oficial do KPI;
- selecionar canais e agrupamentos;
- cadastrar controles: preço, promoções, feriados, distribuição, eventos, clima ou variáveis econômicas;
- avaliar automaticamente a suficiência do histórico e sugerir redução de variáveis quando necessário.

### 6.2 Conectores

Obrigatórios:

- Meta Ads;
- Google Ads.

Necessários para o KPI configurável:

- GA4;
- webhook/API genérica;
- upload CSV/XLSX como fallback operacional;
- conector com CRM ou ERP definido por cliente.

A versão completa deve possuir uma interface de adaptadores. Cada conector implementa: autenticação, backfill, sync incremental, paginação, rate limiting, refresh de token, mapeamento de conta e relatório de reconciliação.

### 6.3 Dados e qualidade

- série canônica diária, agregável para semana;
- taxonomia comum de canal, campanha, objetivo e funil;
- moeda normalizada, mantendo valor e moeda originais;
- calendário e fuso por cliente;
- regras para faltantes, zeros, outliers, duplicatas e mudanças de tracking;
- comparação entre total da origem e total importado;
- data lineage por linha: origem, conta, consulta, período e horário de coleta;
- score de qualidade antes de liberar treinamento.

Política inicial recomendada:

- alvo de 104 semanas de histórico;
- permitir entre 52 e 103 semanas apenas com alerta, menos variáveis e priors mais conservadores;
- bloquear treinamento quando o KPI estiver incompleto, houver sobreposição de datas ou não existir variação suficiente nos canais;
- nunca preencher automaticamente KPI ausente como zero.

### 6.4 Configuração e execução do modelo

- KPI, período e granularidade;
- canais pagos e variáveis não monetárias;
- controles e eventos;
- priors padrão e avançados;
- adstock e saturação por canal;
- tendência e sazonalidade;
- janela de holdout temporal;
- calibração por lift tests;
- execução assíncrona com status e logs compreensíveis;
- clonagem de configuração e retreino sobre novo snapshot.

### 6.5 Resultados

- baseline versus incremental;
- contribuição por canal e por período;
- ROI/ROAS e retorno marginal com intervalo de credibilidade;
- curvas de resposta e saturação;
- tempo de carryover/adstock;
- decomposição temporal do KPI;
- previsto versus observado;
- diagnóstico de convergência e ajuste;
- comparação com modelo anterior;
- avisos sobre extrapolação e baixa confiança.

### 6.6 Planejador de cenários

- orçamento total e período futuro;
- mínimo, máximo e variação permitida por canal;
- canais obrigatórios e bloqueados;
- distribuição no tempo;
- objetivo: maximizar KPI, maximizar lucro ou atingir meta com menor orçamento;
- comparação entre plano atual, cenário manual e cenário otimizado;
- distribuição probabilística do resultado, não apenas previsão pontual;
- salvar, duplicar, comentar, aprovar e exportar cenário.

### 6.7 Ciclo de aprendizado

- registrar recomendação gerada;
- marcar decisão adotada ou rejeitada;
- documentar motivo;
- criar experimento associado;
- guardar resultado do experimento;
- usar resultados válidos como calibração ou prior do próximo modelo.

## 7. Navegação no Maestro

Novo item principal: `Marketing Mix`.

Telas:

1. Portfólio MMM
   - clientes, última sincronização, saúde dos dados, último modelo e alertas.
2. Visão geral do cliente
   - KPIs, contribuição, ROI, oportunidades e últimas decisões.
3. Fontes de dados
   - conexões, contas, histórico, reconciliação e erros.
4. Dataset
   - dicionário de variáveis, cobertura, qualidade e preview temporal.
5. Modelos
   - configuração, execuções, comparação e diagnósticos.
6. Resultados
   - baseline, incremental, canais, curvas, adstock e incerteza.
7. Planejador
   - cenários e otimização de orçamento.
8. Experimentos
   - hipóteses, lift tests, aprendizados e calibrações.
9. Administração
   - taxonomia, permissões, defaults, custos e retenção.

Permissões sugeridas:

- master: conexão, segredos, modelagem, aprovação e administração;
- gestor: leitura, configuração, execução e criação de cenários, sem acesso a segredos;
- collaborator: somente leitura dos clientes explicitamente autorizados;
- futuro perfil `analyst`: edição técnica dos modelos sem administração global.

## 8. Modelo de dados inicial

Tabelas principais:

- `mmm_client_settings`
- `mmm_data_sources`
- `mmm_connector_accounts`
- `mmm_sync_runs`
- `mmm_raw_manifests`
- `mmm_channel_daily`
- `mmm_outcome_daily`
- `mmm_control_daily`
- `mmm_dataset_snapshots`
- `mmm_model_configs`
- `mmm_model_runs`
- `mmm_model_diagnostics`
- `mmm_channel_contributions`
- `mmm_response_curves`
- `mmm_scenarios`
- `mmm_scenario_allocations`
- `mmm_experiments`
- `mmm_audit_log`

Regras:

- UUIDs internos;
- timestamps em UTC e data de negócio separada;
- valores monetários em tipo decimal, nunca float no banco;
- snapshot imutável depois de usado em execução;
- configuração versionada e imutável depois do início do treino;
- soft delete apenas para configuração; snapshots e runs seguem política de retenção;
- RLS por organização, cliente e papel;
- segredos fora dessas tabelas, usando mecanismo próprio de secrets/vault.

## 9. API e jobs

Endpoints lógicos:

- `POST /mmm/connectors/:provider/oauth/start`
- `GET /mmm/connectors/:provider/oauth/callback`
- `POST /mmm/clients/:id/sync`
- `GET /mmm/clients/:id/data-health`
- `POST /mmm/clients/:id/snapshots`
- `POST /mmm/model-runs`
- `GET /mmm/model-runs/:id`
- `GET /mmm/model-runs/:id/results`
- `POST /mmm/model-runs/:id/scenarios`
- `POST /mmm/scenarios/:id/optimize`
- `POST /mmm/model-runs/:id/calibrations`

Estados de job:

`queued → validating → preparing → sampling → diagnosing → publishing → completed`

Saídas alternativas:

`failed`, `cancelled`, `completed_with_warnings`.

Cada transição deve ser idempotente, possuir heartbeat e registrar erro técnico mais mensagem amigável.

## 10. Roadmap de implementação

Premissa de estimativa: 1 pessoa full-stack, 1 pessoa de dados/ML e apoio parcial de produto/design/QA. Prazo estimado: 21 semanas. Com uma única pessoa acumulando tudo, o prazo deve ser reestimado.

### Fase 0 — Descoberta e contrato de dados — 2 semanas

- fechar KPIs e fontes dos primeiros clientes piloto;
- definir taxonomia e granularidade;
- desenhar schema e RLS;
- produzir dataset sintético de referência;
- validar OAuth e permissões das contas Meta/Google.

Saída: especificação fechada, protótipo navegável e contrato de dados testável.

### Fase 1 — Plataforma de dados e conectores — 4 semanas

- migrations do módulo MMM;
- APIs dedicadas e autorização;
- Meta Ads e Google Ads com backfill e sync incremental;
- GA4, webhook e importador de fallback;
- reconciliação, data health e tela de fontes;
- scheduler, retries e observabilidade.

Saída: um cliente piloto atualizando dados automaticamente e sem duplicação.

### Fase 2 — Motor de modelagem — 5 semanas

- serviço Python e contrato de execução;
- pipeline de features e snapshots;
- modelo Bayesiano inicial com controles, sazonalidade, adstock e saturação;
- diagnósticos, holdout e comparação com baseline ingênuo;
- contribuições, ROI, curvas e incerteza;
- persistência reproduzível de artefatos.

Saída: modelo real treinado em dados piloto, com relatório de validação.

### Fase 3 — Produto e planejamento — 4 semanas

- portfólio, overview, dataset, modelos e resultados;
- planejador manual e otimizador com restrições;
- exportação e histórico de cenários;
- permissões e auditoria no portal.

Saída: fluxo completo de conectar → modelar → interpretar → planejar.

### Fase 4 — Atualização contínua — 3 semanas

- retreino agendado;
- comparação entre versões;
- alertas de quebra de tracking e drift;
- recomendações e ciclo de decisão/experimento;
- calibração por lift tests.

Saída: operação recorrente sem intervenção técnica diária.

### Fase 5 — Hardening e piloto — 3 semanas

- testes de carga e segurança;
- recuperação de falhas e reprocessamento;
- custos, limites e retenção;
- documentação operacional;
- piloto com 2–3 clientes e correções.

Saída: go-live interno com checklist de operação e suporte.

## 11. Critérios de aceite

### Dados

- backfill e sync incremental são idempotentes;
- totais reconciliados por conta, dia e moeda;
- falha parcial não publica snapshot incompleto;
- token expirado gera fluxo de reconexão e alerta;
- todo dado exibido possui origem rastreável.

### Modelo

- execução reproduzível a partir de snapshot, configuração, seed e versão;
- diagnóstico de convergência aprovado ou resultado bloqueado;
- desempenho fora da amostra comparado a baseline ingênuo;
- posterior predictive check disponível;
- contribuições reconciliam com o resultado modelado;
- cenários fora do suporte histórico recebem alerta explícito;
- recomendação de orçamento respeita todas as restrições.

### Segurança

- nenhum token de provedor chega ao frontend;
- service role restrita ao backend/worker;
- autorização verificada no servidor em toda leitura e escrita;
- RLS testada para isolamento entre clientes;
- ações sensíveis registradas em auditoria.

### Produto

- usuário consegue completar o fluxo sem notebook ou terminal;
- erros técnicos são traduzidos em ação recomendada;
- resultados exibem incerteza e data da última atualização;
- todo cenário informa qual modelo e snapshot foram usados.

## 12. Testes

- unitários: normalização, calendário, moeda, transformações e restrições;
- contrato: respostas das APIs Meta/Google e evolução de schema;
- integração: OAuth, backfill, refresh, snapshots e fila;
- modelagem: recuperação de parâmetros em dados sintéticos;
- regressão estatística: dataset dourado com tolerâncias definidas;
- temporal: validação rolling/holdout;
- segurança: RLS, troca de `client_id`, replay e acesso indevido;
- E2E: onboarding até cenário aprovado;
- resiliência: rate limit, token revogado, timeout, job duplicado e worker interrompido.

## 13. Riscos e mitigação

1. KPI sem fonte confiável
   - exigir fonte oficial e data health antes de modelar.
2. Histórico curto ou excesso de canais
   - agregação, taxonomia, priors conservadores e bloqueios de qualidade.
3. Colinearidade entre canais
   - diagnóstico, agrupamento, experimentos e intervalos de incerteza.
4. Resultado estatístico tratado como causal
   - linguagem de produto cuidadosa, calibração e revisão analítica.
5. Mudanças nas APIs de mídia
   - adaptadores versionados, testes de contrato e raw manifests.
6. Custo e duração do treino
   - filas, limites por cliente, amostragem configurável e cache de snapshots.
7. Migração Base44/Supabase em paralelo
   - módulo isolado em tabelas e APIs próprias, sem ampliar `legacy_records`.
8. Vazamento entre clientes
   - RLS, autorização em API, testes negativos e logs de auditoria.

## 14. Sequência de epics

- MMM-001: arquitetura, ADRs e ameaças.
- MMM-002: schema relacional e RLS.
- MMM-003: framework de conectores.
- MMM-004: Meta Ads.
- MMM-005: Google Ads.
- MMM-006: fontes de KPI e controles.
- MMM-007: data health e snapshots.
- MMM-008: serviço Python e fila.
- MMM-009: modelo Bayesiano e diagnósticos.
- MMM-010: resultados e curvas.
- MMM-011: planejador e otimizador.
- MMM-012: atualização, comparação e drift.
- MMM-013: experimentos e calibração.
- MMM-014: portal, permissões e auditoria.
- MMM-015: piloto, documentação e go-live.

## 15. Próximas decisões

Antes da implementação, ainda precisamos fechar:

1. quais serão os 2–3 clientes piloto;
2. qual é a fonte do KPI de cada piloto;
3. contas e níveis de acesso disponíveis em Meta e Google;
4. onde o worker Python será hospedado;
5. orçamento mensal de infraestrutura;
6. frequência de sincronização e retreino;
7. se o primeiro release precisa de GA4 e qual CRM/ERP deve ser priorizado;
8. responsáveis por validar dados, modelo e recomendação antes da publicação.

## Sources

[1] https://www.purplemetrics.com.br/pt — Purple Metrics
[2] https://www.purplemetrics.com.br/pt/science — Purple Metrics — Ciência
[3] https://developers.google.com/meridian/docs/basics/meridian-introduction — Google Meridian — Introdução
[4] https://www.pymc-marketing.io/en/latest/api/generated/pymc_marketing.mmm.mmm.html — PyMC-Marketing MMM
[5] https://facebookexperimental.github.io/Robyn — Meta Robyn
