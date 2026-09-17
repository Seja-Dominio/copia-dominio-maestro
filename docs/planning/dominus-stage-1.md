# Dominus — Etapa 1: adaptador de ferramentas do Maestro

## Entrega

O núcleo do Dominus recebeu um adaptador read-only para o Hermes consultar o
Maestro sem conhecer o Supabase. O adaptador aceita apenas um token de sessão
curto emitido pelo gateway e encaminha consultas para `maestro-data`.

Ferramentas liberadas nesta etapa:

| Ferramenta | Contrato | Uso correto |
|---|---|---|
| `buscar_jobs` | `Job` | Usa `post_date` como data de postagem. |
| `buscar_tarefas` | `Subtask` | Usa `deadline` como prazo e `job_id` para vínculo. |
| `consultar_agenda` | `AgendaEvent` | Consulta eventos por intervalo. |
| `consultar_dashboard` | resumo do Maestro | Respeita o escopo da sessão atual. |

Os contratos são compatíveis com ferramentas de agente (`type: function`) e
possuem limites de paginação. A consulta de atrasos usa filtros de comparação
no Postgres; o Dominus não baixa milhares de registros para filtrar localmente.

## Barreiras mantidas

- não há ferramenta de criar, editar, cancelar, excluir ou transferir;
- não há credencial de banco no Dominus;
- Financeiro, cadastro de clientes e contratos continuam protegidos pela
  autorização Master do Maestro;
- a interpretação semântica continua no agente; o adaptador somente executa
  contratos explícitos e devolve dados estruturados.

## Verificação

- smoke test do adaptador: aprovado;
- sintaxe das funções Edge: aprovada;
- build do aplicativo: aprovado;
- `git diff --check`: aprovado;
- `pytest`: não executado porque não está instalado neste ambiente.

## Fora desta etapa

Hermes ainda não foi instalado na VPS e nenhuma função foi publicada em Dev ou
Prod nesta etapa. A próxima etapa deve conectar o runtime do Hermes a
`MaestroToolAdapter`, emitir o token de sessão pelo gateway e testar permissões
com colaborador, gestor e Master antes do deploy.
