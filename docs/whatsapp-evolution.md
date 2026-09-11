# WhatsApp com Evolution API

O módulo usa uma Edge Function do Supabase como camada segura entre o Maestro e a Evolution API. A chave da Evolution nunca deve ser colocada no frontend, no `.env` do Vite ou no repositório.

## Segredos do Supabase

Cadastre estes valores no projeto Supabase de produção (`fwpisypiiezjhtqxlmqv`):

```text
EVOLUTION_API_URL=https://seu-servidor-evolution.example.com
EVOLUTION_API_KEY=chave-privada-da-evolution
EVOLUTION_INSTANCE=nome-da-instancia
```

O valor correto de `EVOLUTION_INSTANCE` é o nome da instância criada na Evolution, não o telefone nem o ID de um grupo.

## Fluxos disponíveis

- `POST /message/sendText/{instance}` para mensagens de texto.
- `POST /message/sendMedia/{instance}` para arquivos e imagens.
- `GET /group/fetchAllGroups/{instance}` para listar grupos.
- `GET /instance/connectionState/{instance}` para verificar se a instância está conectada.

Depois de cadastrar os segredos, publique a função `whatsapp-send` e teste o indicador de conexão na página Conversas. O envio real deve ser testado somente com uma mensagem e um grupo autorizados.
