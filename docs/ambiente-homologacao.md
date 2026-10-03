# Ambientes Dev e produção — Domínio Maestro

## Objetivo

Separar o ciclo de desenvolvimento do ambiente real. O trabalho diário acontece no projeto Dev e a produção permanece protegida. O Base44 continua disponível como fallback enquanto a migração não for encerrada.

## Estado configurado — revisão necessária

- O mapeamento antigo de Dev para `tqmfuskvllpqmvayjuqu` está suspenso: o Dashboard do Supabase identifica a branch `main` desse ref como `PRODUCTION`.
- `fwpisypiiezjhtqxlmqv` também está classificado como Produção na configuração existente. Não use nenhum desses dois refs em desenvolvimento ou teste.
- O ref oficial do Dev ainda não foi confirmado. Até isso ocorrer, use apenas clones locais e CI; não execute auditoria, migration, alteração de segredo ou deploy em banco hospedado.
- O vínculo local da CLI Supabase foi removido neste checkout para evitar que comandos `--linked` atinjam o ref ambíguo. O unlink não alterou nenhum projeto remoto.
- A inspeção somente leitura do checkout principal encontrou `VITE_MAESTRO_ENV=development`/`.env.local` apontando para `tqmfuskvllpqmvayjuqu` e o vínculo CLI também nesse ref. Esse checkout tem mudanças locais extensas; foi deixado intacto. Portanto, a contenção desta branch ainda não protege o app do checkout principal; não o execute nem rode comandos `--linked` até reconciliar o ref e incorporar a correção com segurança.
- Os scripts de auditoria/transferência também verificam os refs explicitamente; o sincronizador Prod→Dev exige `--allow-production-read` porque mesmo o modo `--dry-run` consulta a origem Produção.
- Os snapshots com nomes `development` e `production` abaixo estão sob revisão quanto à origem; não inferir ambiente apenas pelo nome do diretório.

## Configuração dos dois projetos Supabase

1. Confirme no Dashboard o nome do projeto, branch e ref oficial do Dev.
2. Confirme separadamente qual ref atende Produção, sem consultar o conteúdo do banco.
3. Só então configure templates/env locais e vínculo CLI; mantenha secrets separados.
4. Não rode migrations/Edge Function deploy até o destino Dev estar verificado.
5. Dados de teste não devem ser gravados em nenhum ref identificado como Production.

## Configurar a máquina local

Após confirmar o ref oficial do Dev, `.env.local` deve conter a mesma ref na URL e na variável dedicada:

```text
VITE_MAESTRO_ENV=development
VITE_MAESTRO_DEV_PROJECT_REF=REF_DEV_CONFIRMADO
VITE_SUPABASE_URL=https://REF_DEV_CONFIRMADO.supabase.co
```

O frontend agora recusa chamadas em development/test sem ref explícito correspondente, e bloqueia os refs protegidos acima. Os arquivos `.env*` preenchidos são ignorados pelo Git.

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
