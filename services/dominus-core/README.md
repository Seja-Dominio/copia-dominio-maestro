# Dominus Core — adaptador do Maestro

Este pacote é a primeira integração do Hermes/Dominus com o sistema. Ele expõe
somente ferramentas de consulta:

- `buscar_jobs`: usa `post_date` como data de postagem do Job;
- `buscar_tarefas`: consulta tarefas/subtarefas e usa `deadline` como prazo;
- `consultar_agenda`: consulta eventos por intervalo;
- `consultar_dashboard`: consulta o resumo permitido pelo perfil da sessão.

O pacote não conhece o Supabase, não aceita credenciais de banco e não possui
operações de criação, edição ou exclusão. O token é fornecido pelo gateway e o
Maestro continua responsável por autenticação, escopo e filtragem de dados.

## Uso no Hermes

```python
from maestro_adapter import MaestroToolAdapter

adapter = MaestroToolAdapter(
    endpoint="https://<projeto>.supabase.co",
    session_token="<sessão curta emitida pelo gateway>",
)
tools = adapter.tool_definitions()
resultado = adapter.call("buscar_jobs", {"overdue_only": True})
```

O suporte a escrita, dados financeiros, cadastro de clientes e contratos fica
fora desta etapa e continuará sujeito às permissões já existentes.
