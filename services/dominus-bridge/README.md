# Ponte Hermes ↔ Maestro

Serviço interno para o webhook do Dominus. A Evolution API continua sendo o
canal do WhatsApp; esta ponte apenas entrega a pergunta ao Hermes e fornece ao
Hermes um servidor MCP local com consultas somente leitura do Maestro.

## Segurança

- A Edge Function assina cada requisição com `DOMINUS_HERMES_BRIDGE_SECRET`.
- O corpo assinado contém um token curto emitido pelo Maestro, nunca uma chave
  do Supabase.
- O token fica em arquivo temporário, com permissão restrita ao usuário
  `hermes`, e é consumido pelo MCP durante a consulta.
- O Hermes não recebe `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` ou
  qualquer credencial de banco.
- O serviço aceita somente JSON pequeno, não armazena mídia bruta e mantém a
  consulta serializada para não misturar tokens de usuários diferentes.

