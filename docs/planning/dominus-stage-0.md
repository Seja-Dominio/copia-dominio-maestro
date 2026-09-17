# Dominus — Etapa 0: auditoria e arquitetura oficial

## Objetivo

Definir a base técnica do agente Dominus antes de instalar dependências, alterar o fluxo de dados ou publicar novas funções.

## Decisão arquitetural

```text
WhatsApp / Evolution API
          ↓
Dominus Gateway (Supabase Edge Function)
          ↓  webhook, grupos, janela de 10 s, mídia e segurança
Dominus Core (VPS, baseado no Hermes Agent)
          ↓  contexto, memória, ferramentas e decisão
Maestro Tool API
          ↓  dados atuais, escopo e permissões
Projeto MMM (Meridian)
          ↓  resultados agregados
Resposta curta, estruturada e contextual
```

O Dominus substitui o Maestro na interação com a equipe, mas o Maestro permanece internamente como camada de dados e permissões até que exista uma substituição validada. Isso evita expor banco, credenciais ou regras de acesso ao runtime do agente.

## Repositórios avaliados

| Repositório | Decisão | Motivo |
|---|---|---|
| [NousResearch/Hermes-Agent](https://github.com/NousResearch/Hermes-Agent) | Base comportamental do Dominus | MIT; agente com memória, skills, ferramentas e aprendizado. Deve rodar isolado na VPS, sem acesso direto ao banco. |
| [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | Avaliação posterior | MIT; bom para contratos tipados, ferramentas e saídas estruturadas. Não entra junto com Hermes na primeira versão para evitar dois orquestradores. |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Não entra no MVP | MIT e forte em workflows persistentes, mas duplicaria a orquestração do Hermes neste momento. |
| [vercel/ai](https://github.com/vercel/ai) | Uso opcional na interface | Toolkit TypeScript adequado ao chat interno e respostas estruturadas; não será o cérebro do agente WhatsApp. |
| [google/meridian](https://github.com/google/meridian) | Motor oficial do MMM | Apache-2.0 e específico para Marketing Mix Modeling. O número de estrelas não é o critério principal neste caso; especialização e origem oficial pesam mais. |

## Regras que ficam congeladas

1. Um único orquestrador principal: Hermes/Dominus.
2. Um único modelo configurado para o agente: `gpt-5.6-luna`, sem Gemini.
3. O Dominus nunca consulta o Supabase diretamente.
4. Financeiro, cadastro de clientes e contratos exigem identidade vinculada e nível Master.
5. Áudio e imagem entram como contexto temporário; conteúdo bruto não é armazenado.
6. Meridian recebe apenas dados agregados e devolve resultados estruturados.
7. Toda ferramenta precisa ter contrato, escopo, auditoria e teste de permissão.
8. O código será versionado com dependências fixadas e sem copiar repositórios inteiros para o produto.

## Estado encontrado no projeto

- `dominus-webhook` já funciona como gateway seguro da Evolution API.
- A configuração de grupos e o grupo Produção já estão presentes.
- O núcleo `maestro-ai` já possui ferramentas para Jobs, subtarefas, responsáveis, fluxo operacional e MMM.
- O serviço Python do Projeto MMM já possui contrato agregado e Meridian como modelo oficial.
- A janela de agrupamento de mensagens de 10 segundos foi implementada localmente, mas ainda precisa ser publicada.

## Próxima etapa autorizada

**Etapa 1 — Núcleo do Dominus:** criar o adaptador do Hermes para o contrato de ferramentas do Maestro, mantendo o gateway atual, permissões e resposta estruturada.

Não instalar Hermes, alterar infraestrutura ou publicar em Dev/Prod antes da revisão dos contratos de ferramenta e do plano de rollback da Etapa 1.

