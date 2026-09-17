# Dominus — Etapa 2: ponte Hermes

## Entrega

Foi criada a ponte que registra as ferramentas do Maestro no formato de
funções de agente e encaminha chamadas do Hermes para o adaptador read-only da
[Etapa 1](./dominus-stage-1.md).

O fluxo fica:

```text
Hermes/Dominus → HermesToolBridge → MaestroToolAdapter → maestro-data
```

A ponte também centraliza as regras de interpretação operacional: `post_date`
é a data do Job e `deadline` é o prazo da tarefa/subtask. Chamadas inválidas,
JSON malformado e ferramentas de escrita retornam erro seguro, sem exceção
vazar para o agente.

## Validação de perfis

A ponte envia o token da sessão original em todas as consultas. A decisão de
escopo permanece no Maestro, que valida o colaborador ativo e o nível de acesso
antes de responder. Assim, o mesmo caminho pode ser testado com colaborador,
gestor e Master sem duplicar regras de autorização na VPS.

## Fora desta etapa

O runtime Hermes não foi instalado nem iniciado na VPS porque não há acesso de
infraestrutura configurado neste workspace. Também não houve publicação em
Dev/Prod. A instalação deverá receber apenas a URL do Maestro e um token de
sessão emitido pelo gateway; nunca `SUPABASE_SERVICE_ROLE_KEY`.
