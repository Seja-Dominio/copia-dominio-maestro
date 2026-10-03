# Domínio Maestro

Aplicação React/Vite com Supabase como único provider de runtime. O login de
colaboradores usa a Edge Function `collaborator-login`; ela valida as
credenciais, seleciona a organização ativa e emite uma sessão HMAC curta,
revalidada pelos handlers protegidos. Rotas e dados do app usam o cliente e as
Edge Functions Supabase.

## Desenvolvimento

```bash
npm ci
npm run dev
```

Configure um `.env.local` local com o projeto Supabase Dev explicitamente
confirmado:

```text
VITE_MAESTRO_ENV=development
VITE_MAESTRO_DEV_PROJECT_REF=<project-ref-dev>
VITE_SUPABASE_URL=https://<project-ref-dev>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key-do-dev>
VITE_MAESTRO_DATA_PROVIDER=supabase
```

O app recusa um provider diferente de `supabase` e valida o projeto-alvo antes
de enviar chamadas. Nunca coloque service-role keys no frontend ou no Git.

## Validação

```bash
npm run build
npm run test:module-isolation
node --test scripts/lib/*.test.mjs
```

## Importação histórica

O utilitário `migration:import-base44` e as migrations antigas que mencionam
`migration.base44_records` existem somente para preservar/reconciliar exports
legados e replay histórico. Eles não são um provider do app e não devem ser
usados como backend de runtime. Não apague esses artefatos até concluir a
reconciliação dos dados e comprovar que nenhum snapshot ainda é necessário.
