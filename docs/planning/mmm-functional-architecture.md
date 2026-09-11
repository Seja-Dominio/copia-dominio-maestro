# Especificação funcional, pré-requisitos e arquitetura — MMM Maestro

Status: rascunho v0.1 para discussão

Documento relacionado: `docs/planning/mmm-maestro.md`

## 1. Objetivo desta etapa

Transformar a visão inicial do módulo de Marketing Mix Modeling em três contratos verificáveis:

1. catálogo de funcionalidades com prioridades e critérios de aceite;
2. pré-requisitos para iniciar desenvolvimento e para liberar cada cliente;
3. arquitetura-alvo compatível com o Maestro atual, sem acoplar o novo módulo ao legado.

Este documento ainda não escolhe provedor de fila, hospedagem do worker ou CRM prioritário. Essas decisões ficam registradas como ADRs antes da implementação.

## 2. Limite do produto

O módulo deve apoiar o ciclo:

`conectar → validar dados → preparar snapshot → modelar → diagnosticar → interpretar → simular → aprovar → acompanhar aprendizado`

Dentro do escopo:

- operação interna da agência para múltiplos clientes;
- Meta Ads e Google Ads como fontes iniciais de mídia;
- KPI configurável por cliente;
- fontes de KPI por conector, webhook/API ou arquivo;
- treinamento e retreinamento assíncrono;
- resultados com incerteza e diagnóstico;
- planejamento de cenários com restrições;
- rastreabilidade de dados, modelos e decisões.

Fora do primeiro release produtivo:

- atribuição de usuário ou jornada individual;
- bidding automático nas plataformas de mídia;
- alteração automática de campanhas;
- promessa de causalidade sem calibração ou experimento;
- rede Bayesiana proprietária equivalente à Purple Metrics;
- marketplace público de conectores;
- SaaS independente do Maestro.

## 3. Perfis e autorização

### 3.1 Perfis

- `master`: administra conectores, acessos, modelos, publicação e configurações globais.
- `gestor`: configura datasets, executa modelos, cria cenários e visualiza clientes autorizados.
- `collaborator`: consulta resultados e cenários dos clientes explicitamente autorizados.
- `analyst` futuro: administra configuração estatística sem acesso a credenciais ou administração global.
- `worker`: identidade técnica com escopo mínimo para jobs, dados e artefatos.

### 3.2 Regra central

Autorização não pode depender do `client_id` enviado pelo navegador. Toda operação deve resolver no servidor:

- identidade da sessão;
- organização ativa;
- clientes permitidos;
- ação permitida pelo perfil;
- recurso pertencente ao mesmo cliente.

O banco deve reforçar o isolamento. Caso a API use `service_role`, ela ignora RLS; portanto a API precisa de verificações explícitas ou deve operar com JWT compatível com RLS. Essa escolha precisa ser formalizada no ADR de autenticação.

## 4. Catálogo de funcionalidades

Prioridades:

- P0: necessária para o primeiro fluxo produtivo.
- P1: necessária para operação recorrente e escala controlada.
- P2: evolução posterior.

### 4.1 Portfólio e onboarding

- FR-001 P0 — listar clientes elegíveis e estado do MMM.
- FR-002 P0 — ativar o módulo para um cliente existente no Maestro.
- FR-003 P0 — configurar moeda, fuso, calendário e granularidade.
- FR-004 P0 — definir KPI principal, unidade e fonte oficial.
- FR-005 P0 — configurar taxonomia de canais.
- FR-006 P0 — cadastrar variáveis de controle e eventos.
- FR-007 P0 — avaliar suficiência de histórico antes da modelagem.
- FR-008 P1 — clonar configuração entre clientes com revisão obrigatória.

Aceite mínimo:

- ativação não duplica configuração;
- cliente sem fonte oficial de KPI não pode publicar modelo;
- alterações ficam auditadas com autor e data;
- um usuário não visualiza cliente sem concessão explícita.

### 4.2 Conectores de mídia

- FR-020 P0 — OAuth e seleção de contas do Meta Ads.
- FR-021 P0 — OAuth e seleção de contas do Google Ads.
- FR-022 P0 — backfill por período configurável.
- FR-023 P0 — sincronização incremental idempotente.
- FR-024 P0 — renovação de token e fluxo de reconexão.
- FR-025 P0 — mapeamento de conta/campanha para cliente e canal canônico.
- FR-026 P0 — reconciliação entre total consultado e total persistido.
- FR-027 P1 — reprocessamento por intervalo sem duplicação.
- FR-028 P1 — alertas de atraso, falha e mudança de schema.

Aceite mínimo:

- credenciais nunca chegam ao frontend;
- cada execução registra conta, consulta, janela e cursor;
- reexecutar a mesma janela não duplica fatos;
- falha parcial não marca a sincronização como concluída.

### 4.3 Fontes de KPI e controles

- FR-040 P0 — importação CSV/XLSX com template versionado.
- FR-041 P0 — webhook/API genérica autenticada.
- FR-042 P0 — mapeamento de data, KPI, unidade e dimensões.
- FR-043 P0 — validação de duplicidade, lacunas e granularidade.
- FR-044 P1 — GA4.
- FR-045 P1 — primeiro conector CRM/ERP definido pelos pilotos.
- FR-046 P1 — calendário de feriados, promoções e eventos.
- FR-047 P2 — fontes macroeconômicas ou clima.

Aceite mínimo:

- KPI ausente não é convertido em zero automaticamente;
- upload apresenta preview e erros antes de publicar;
- nova carga preserva a origem e não sobrescreve histórico silenciosamente.

### 4.4 Qualidade e catálogo de dados

- FR-060 P0 — visão de cobertura temporal por variável.
- FR-061 P0 — regras de faltantes, zeros, outliers e duplicatas.
- FR-062 P0 — score de prontidão para modelagem.
- FR-063 P0 — bloqueios para erros críticos e avisos para riscos toleráveis.
- FR-064 P0 — dicionário de variáveis e taxonomia.
- FR-065 P0 — lineage até origem e execução de ingestão.
- FR-066 P1 — detecção de quebra de tracking e drift.
- FR-067 P1 — aprovação manual de correções de dados.

Aceite mínimo:

- score é explicável por regras, não um número opaco;
- toda correção gera nova versão do dataset;
- bloqueio informa causa, período afetado e ação recomendada.

### 4.5 Snapshots e datasets

- FR-080 P0 — gerar snapshot imutável para treinamento.
- FR-081 P0 — registrar filtro temporal, variáveis e transformações.
- FR-082 P0 — calcular fingerprint do conteúdo e da configuração.
- FR-083 P0 — impedir alteração após vínculo a um model run.
- FR-084 P1 — comparar snapshots.
- FR-085 P1 — política de retenção e arquivamento.

Aceite mínimo:

- o mesmo snapshot pode reproduzir a matriz de treinamento;
- nenhum model run aponta para dados mutáveis;
- snapshot incompleto ou inválido não é publicado.

### 4.6 Configuração e execução do modelo

- FR-100 P0 — criar e versionar configuração de modelo.
- FR-101 P0 — selecionar KPI, canais, controles, período e holdout.
- FR-102 P0 — configurar adstock, saturação, tendência e sazonalidade.
- FR-103 P0 — disponibilizar modo padrão e modo avançado.
- FR-104 P0 — executar treinamento assíncrono.
- FR-105 P0 — acompanhar status, progresso e logs amigáveis.
- FR-106 P0 — cancelar execução quando tecnicamente seguro.
- FR-107 P0 — persistir seed, versões, parâmetros e artefatos.
- FR-108 P1 — retreino agendado.
- FR-109 P1 — calibração com experimentos.
- FR-110 P2 — benchmark automático entre motores.

Aceite mínimo:

- configuração torna-se imutável quando a execução começa;
- execução duplicada com mesma chave idempotente não cria treino concorrente;
- modelo sem diagnóstico mínimo não pode ser publicado como confiável;
- erro técnico mantém contexto para suporte sem expor segredo ao usuário.

### 4.7 Resultados e interpretação

- FR-120 P0 — observado versus previsto e baseline versus incremental.
- FR-121 P0 — contribuição por canal e período.
- FR-122 P0 — ROI/ROAS e retorno marginal com intervalo de credibilidade.
- FR-123 P0 — curvas de resposta, saturação e carryover.
- FR-124 P0 — diagnósticos de convergência e validação temporal.
- FR-125 P0 — avisos de baixa confiança e extrapolação.
- FR-126 P1 — comparação entre versões do modelo.
- FR-127 P1 — comentários e aprovação para publicação.
- FR-128 P1 — exportação de relatório e dados agregados.

Aceite mínimo:

- todo gráfico informa período, modelo, snapshot e atualização;
- estimativas exibem incerteza quando disponível;
- contribuições reconciliam com o resultado modelado dentro de tolerância;
- resultado reprovado continua acessível no histórico, mas não aparece como vigente.

### 4.8 Planejamento de cenários

- FR-140 P0 — criar cenário manual a partir de um modelo publicado.
- FR-141 P0 — definir orçamento, horizonte e restrições por canal.
- FR-142 P0 — comparar plano atual, manual e otimizado.
- FR-143 P0 — otimizar KPI, lucro ou orçamento para meta.
- FR-144 P0 — exibir distribuição esperada e risco.
- FR-145 P0 — alertar quando o cenário extrapola suporte histórico.
- FR-146 P1 — salvar, duplicar, comentar e aprovar.
- FR-147 P1 — registrar adoção total, parcial ou rejeição.
- FR-148 P2 — exportar plano para plataformas sem ativação automática.

Aceite mínimo:

- todas as restrições são respeitadas;
- cenário aponta para model run imutável;
- otimização informa inviabilidade em vez de relaxar restrições silenciosamente.

### 4.9 Experimentos e aprendizado

- FR-160 P1 — cadastrar hipótese e experimento.
- FR-161 P1 — associar canais, regiões, períodos e métrica.
- FR-162 P1 — registrar resultado e qualidade do experimento.
- FR-163 P1 — aprovar uso como calibração ou prior.
- FR-164 P1 — vincular recomendação, decisão e resultado observado.
- FR-165 P2 — sugerir experimento por maior incerteza ou valor de informação.

### 4.10 Administração e operação

- FR-180 P0 — auditoria de ações sensíveis.
- FR-181 P0 — monitor de jobs, retries e falhas.
- FR-182 P0 — gestão segura de segredos por provedor e conta.
- FR-183 P0 — limites por cliente para sync e modelagem.
- FR-184 P1 — custos por execução e cliente.
- FR-185 P1 — política de retenção e exclusão.
- FR-186 P1 — alertas operacionais.

## 5. Pré-requisitos

### 5.1 Gate A — antes de desenvolver

- PR-001 — decidir a estratégia de autenticação: migrar para Supabase Auth ou manter sessão própria com autorização explícita.
- PR-002 — introduzir relação relacional entre organização, cliente, colaborador e concessão de acesso.
- PR-003 — definir ambientes separados: local, staging e produção.
- PR-004 — escolher fila/scheduler e hospedagem dos workers Python.
- PR-005 — escolher secret manager e política de rotação.
- PR-006 — definir storage de artefatos e política de retenção.
- PR-007 — definir SLOs, orçamento e limites de execução.
- PR-008 — criar contas de desenvolvedor e aplicações OAuth Meta/Google.
- PR-009 — definir contrato canônico de mídia, KPI e controles.
- PR-010 — aprovar classificação de dados e política de LGPD.

Sem PR-001 e PR-002, não é seguro construir a camada multi-cliente.

### 5.2 Gate B — antes de integrar um cliente

- cliente e organização identificados por IDs estáveis;
- responsável de negócio e responsável técnico definidos;
- KPI principal e fonte oficial aprovados;
- contas Meta/Google e escopos OAuth disponíveis;
- moeda, fuso e calendário definidos;
- taxonomia de canais aprovada;
- política de histórico e retenção aprovada;
- contrato de tratamento de dados validado;
- período de histórico conhecido;
- mudanças relevantes de tracking documentadas.

### 5.3 Gate C — antes de treinar

- snapshot imutável e reconciliado;
- cobertura temporal mínima aprovada;
- KPI sem lacunas críticas;
- canais com variação suficiente;
- taxonomia sem dupla contagem;
- controles revisados;
- holdout temporal reservado;
- configuração versionada;
- custo estimado dentro do limite;
- aprovador analítico definido.

### 5.4 Gate D — antes de publicar

- execução concluída sem falha crítica;
- convergência e posterior predictive checks aprovados;
- desempenho comparado a baseline;
- contribuições reconciliadas;
- intervalos e limitações documentados;
- revisão analítica registrada;
- dados sensíveis ausentes dos artefatos públicos;
- model run e snapshot fixados na publicação.

## 6. Arquitetura-alvo

### 6.1 Contexto

```text
Usuário Maestro
      |
      v
React/Vite — módulo Marketing Mix
      |
      v
API/BFF MMM — autenticação, autorização e contratos
      |
      +--------------------+
      |                    |
      v                    v
Postgres/Supabase      Fila/Scheduler
      |                    |
      |              +-----+------+
      |              |            |
      v              v            v
Object Storage   Connector     Model Worker
                 Workers         Python
                     |            |
                     v            v
              Meta/Google/   PyMC-Marketing
              KPI sources
```

### 6.2 Componentes

#### Frontend

- nova rota e item `Marketing Mix`;
- componentes por domínio, não chamadas diretas a tabelas;
- TanStack Query para estado remoto;
- polling ou eventos para progresso de jobs;
- nenhum token OAuth ou artefato privado no navegador;
- feature flag para ativação gradual.

#### API/BFF MMM

Responsável por:

- validar sessão e autorização por ação/recurso;
- resolver organização e cliente no servidor;
- validar payloads e idempotency keys;
- criar comandos assíncronos;
- emitir URLs assinadas quando necessário;
- retornar DTOs estáveis para o frontend;
- registrar auditoria.

O endpoint genérico `maestro-data` não deve servir as tabelas MMM. Ele trabalha com `legacy_records`, carrega listas completas e usa `service_role`; isso não oferece o contrato, a paginação nem o isolamento necessários ao módulo.

#### Postgres/Supabase

Separar schemas lógicos:

- configuração e acesso;
- ingestão e catálogo;
- snapshots;
- modelagem;
- cenários e experimentos;
- jobs e auditoria.

Regras:

- todas as entidades de domínio carregam `organization_id` e `client_id` quando aplicável;
- FKs compostas ou validações impedem vínculo cruzado entre clientes;
- valores monetários usam decimal e moeda explícita;
- datas de negócio são separadas de timestamps UTC;
- configurações, snapshots e runs são versionados e imutáveis após uso;
- índices começam por tenant/cliente nos acessos mais comuns.

#### Connector Workers

- um adaptador por provedor;
- credenciais lidas do secret manager;
- raw manifest por consulta, sem armazenar segredo;
- paginação, rate limit, retry e cursor;
- staging antes de merge canônico;
- reconciliação e métricas de qualidade;
- idempotência por cliente, fonte, conta e janela.

#### Model Worker

- serviço Python separado;
- imagem/versionamento reproduzível;
- leitura exclusiva de snapshots publicados;
- treinamento, diagnóstico, decomposição e otimização;
- persistência de resultados tabulares no Postgres;
- artefatos grandes no object storage;
- heartbeat, cancelamento cooperativo e limite de recursos.

#### Fila e scheduler

Tipos de job separados:

- connector sync;
- data-quality evaluation;
- snapshot build;
- model train;
- scenario optimize;
- report export;
- retention cleanup.

Cada job possui:

- payload versionado;
- idempotency key;
- prioridade;
- número de tentativas;
- `available_at`;
- lease/heartbeat;
- estado e erro estruturado;
- dead-letter após limite.

### 6.3 Fluxo de dados

1. usuário conecta uma conta pelo fluxo OAuth;
2. callback grava referência do segredo e metadados da conta;
3. API cria sync job idempotente;
4. worker consulta a origem e grava staging/raw manifest;
5. worker normaliza, reconcilia e publica fatos canônicos;
6. data-health avalia cobertura e bloqueios;
7. usuário cria um snapshot imutável;
8. API enfileira model run associado ao snapshot e config;
9. model worker persiste diagnósticos, resultados e artefatos;
10. analista revisa e publica o run;
11. cenários sempre referenciam o run publicado;
12. decisões e experimentos alimentam o ciclo seguinte.

## 7. Decisões arquiteturais pendentes

Criar ADRs para:

- ADR-001 — autenticação e autorização multi-cliente;
- ADR-002 — fila, scheduler e semântica de entrega;
- ADR-003 — hospedagem e autoscaling dos workers;
- ADR-004 — gestão de segredos e OAuth;
- ADR-005 — contrato canônico de dados;
- ADR-006 — armazenamento e versionamento de artefatos;
- ADR-007 — motor de MMM e interface de engines;
- ADR-008 — estratégia de observabilidade e custos;
- ADR-009 — retenção, exclusão e LGPD;
- ADR-010 — eventos/polling para progresso no frontend.

## 8. Corte recomendado para a primeira entrega vertical

Construir uma fatia completa, sem começar por todas as telas:

1. ativar um cliente;
2. importar KPI por CSV;
3. sincronizar uma conta de um único provedor de mídia;
4. mostrar data health;
5. produzir snapshot;
6. executar um modelo mínimo em worker real;
7. mostrar observado versus previsto, contribuição e diagnóstico;
8. criar um cenário manual;
9. verificar autorização, auditoria e reprodução ponta a ponta.

Depois de validar essa fatia, ampliar para segundo provedor, OAuth completo, otimização, retreino e experimentos. Isso reduz o risco de construir conectores e portal antes de validar o contrato entre dados, modelo e produto.

## 9. Questões que precisamos fechar na próxima revisão

1. O Maestro terá uma única organização inicialmente ou já precisa suportar várias agências?
2. O login atual será migrado para Supabase Auth antes do MMM?
3. Quais perfis podem visualizar investimento, ROI e receita?
4. O KPI pode ter múltiplas séries por região, produto ou unidade?
5. A granularidade inicial será diária na ingestão e semanal na modelagem?
6. Qual conector deve formar a primeira fatia vertical: Meta Ads ou Google Ads?
7. Qual infraestrutura pode hospedar workers Python de longa duração?
8. Qual limite mensal de custo por cliente/model run?
9. Resultados exigem aprovação de um analista antes de ficarem visíveis?
10. Qual retenção é necessária para dados brutos, snapshots e artefatos?
