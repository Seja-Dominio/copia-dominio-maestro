# Ambientes Dev e produção — Domínio Maestro

## Objetivo

Separar o ciclo de desenvolvimento do ambiente real. O trabalho diário acontece no projeto Dev e a produção permanece protegida. O Base44 continua disponível como fallback enquanto a migração não for encerrada.

## Estado configurado — mapeamento confirmado em 02/10/2026

- O usuário confirmou `tqmfuskvllpqmvayjuqu` como projeto Supabase Dev e `fwpisypiiezjhtqxlmqv` como Supabase Produção. O projeto Dev aparece no Dashboard como “Dominio Maestro Development”; a branch primária exibe `main PRODUCTION`. A Produção do frontend é o VPS `srv1611248.hstgr.cloud` (`187.127.27.151`), não um destino de frontend no Supabase.
- O código local deve aceitar `tqmf…` somente quando `VITE_MAESTRO_DEV_PROJECT_REF`/`SUPABASE_CONFIRMED_DEV_PROJECT_REF` declarar exatamente esse ref; `fwpisy…` permanece bloqueado em development/test e permitido somente no endpoint de Produção já definido. Esta confirmação do ambiente não libera operações de escrita: migration/deploy em Dev ainda requerem revisão do diff, preflight, escopo e gate próprio.
- O vínculo local da CLI Supabase foi removido neste checkout. Antes de qualquer comando vinculado, conferir `project ref` no mesmo comando/sessão e não confiar em estado implícito de `--linked`.
- O checkout principal tem mudanças locais extensas e permanece intacto; esta alteração de guardas afeta apenas este worktree/branch até ser integrada.
- Os scripts de auditoria/transferência também verificam os refs explicitamente; o sincronizador Prod→Dev exige `--allow-production-read` porque mesmo o modo `--dry-run` consulta a origem Produção.
- Os snapshots com nomes `development` e `production` abaixo estão sob revisão quanto à origem; não inferir ambiente apenas pelo nome do diretório.

## Configuração dos dois projetos Supabase

1. O mapeamento confirmado é `tqmfuskvllpqmvayjuqu` (Dev) e `fwpisypiiezjhtqxlmqv` (Supabase Produção); confira o ref visível no Dashboard antes de cada operação.
2. Trate o VPS `srv1611248.hstgr.cloud` (`187.127.27.151`) como o único destino autorizado para o frontend em Produção.
3. Só então configure templates/env locais e vínculo CLI; mantenha secrets separados.
4. Não rode migrations/Edge Function deploy até o destino Dev estar verificado.
5. Dados de teste não devem ser gravados em nenhum ref identificado como Production.

## Configurar a máquina local

`.env.local` deve conter a mesma ref Dev confirmada pelo usuário na URL e na variável dedicada:

```text
VITE_MAESTRO_ENV=development
VITE_MAESTRO_DEV_PROJECT_REF=tqmfuskvllpqmvayjuqu
VITE_SUPABASE_URL=https://tqmfuskvllpqmvayjuqu.supabase.co
```

O frontend recusa chamadas em development/test sem ref explícito correspondente e bloqueia o ref de Produção. Os arquivos `.env*` preenchidos são ignorados pelo Git.

## Rodar e testar

```text
npm install
npm run dev
```

Abra `http://127.0.0.1:4173`.

Para validar o build Dev:

```text
npm run build:dev
npm run preview:dev
```

## Fluxo por lote funcional

1. Confirmar a branch e o estado do Git.
2. Implementar um lote coerente, por exemplo propostas, permissões, agenda ou dashboard.
3. Testar no modo `test` com dados isolados.
4. Rodar `npm run build:test`.
5. Testar login, leitura, criação, edição e exclusão conforme o lote.
6. Registrar evidências e fazer um commit do lote.
7. Fazer um único push da branch após a validação do lote.
8. Publicar no KVM2 somente depois da aprovação.
9. Validar o domínio real.
10. Fazer merge para `main` somente quando a versão externa estiver estável.

## Publicação em produção

O KVM2 recebe somente o conteúdo compilado de `dist/`. O código-fonte fica no GitHub e os dados/funções ficam no Supabase. Em 02/10/2026, o usuário confirmou `srv1611248.hstgr.cloud` (`187.127.27.151`) como **único VPS autorizado para o Maestro**; não publique no outro VPS Hostinger da conta.

```text
npm run build
scp -i /Users/grimm/.ssh/maestro-kvm2 -r dist root@187.127.27.151:/tmp/maestro-dist
ssh -i /Users/grimm/.ssh/maestro-kvm2 root@187.127.27.151 'docker cp /tmp/maestro-dist/. maestro-web:/usr/share/nginx/html/ && rm -rf /tmp/maestro-dist'
curl -I https://dominiomaestro.com.br/
```

Esperado: container `maestro-web` ativo e resposta HTTP 200.

## Regras de segurança

- Nunca testar exclusão, arquivamento ou alteração de senha contra produção.
- Nunca colocar senha, service-role key, token ou chave SSH no código, PDF ou GitHub.
- Não usar `.env.local` de produção para iniciar homologação.
- Não desligar o Base44 enquanto a equipe depender dele.
- Não fazer `git reset --hard`, `git checkout --` ou exclusão de dados para resolver conflito.

## Rollback

Se a homologação falhar, corrija a branch sem publicar. Se a produção já tiver sido publicada, recompile e reenvie a última `dist` conhecida como boa. Mudanças de banco devem ter migração reversível ou plano explícito de restauração.

## Regra de sincronização

Dev é a fonte de validação. Após cada lote aprovado no Dev, sincronize migrations e Edge Functions com produção em uma janela separada. Nunca use o `.env.local` do Dev para publicar e nunca publique uma alteração que não tenha sido validada no Dev.
