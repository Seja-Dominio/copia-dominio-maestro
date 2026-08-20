## Domínio Maestro

Aplicação em migração gradual do Base44 para Supabase.

### Importar o export do Base44

O primeiro estágio preserva cada registro em `public.legacy_records`, mantendo a entidade, o ID original e o payload completo. A operação é idempotente e não apaga dados do Base44.

1. Execute a migration `supabase/migrations/0001_legacy_records.sql` no projeto Supabase.
2. Faça um ensaio sem escrita:

```bash
npm run migration:import-base44 -- --zip /Users/grimm/Downloads/Arquivo.zip --dry-run
```

3. Para importar, use uma `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente local/servidor de migração e execute o mesmo comando sem `--dry-run`.
4. Depois, confira a preservação dos registros:

```bash
npm run migration:import-base44 -- --zip /Users/grimm/Downloads/Arquivo.zip --verify
```

O `--verify` é somente leitura e compara quantidade, entidade, ID e `updated_date` do export com o destino.

Não coloque a service-role key em `.env.local` usado pelo frontend nem no Git.

O login de colaboradores continua usando Base44 por padrão. Depois de aplicar
`supabase/migrations/0002_collaborator_auth.sql`, importar os colaboradores e
publicar a Edge Function `collaborator-login`, habilite o novo fluxo no
frontend com:

```bash
VITE_MAESTRO_AUTH_PROVIDER=supabase npm run dev
```

---

### Estado legado

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
