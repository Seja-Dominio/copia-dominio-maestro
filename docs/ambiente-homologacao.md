# Ambientes Dev e produção — Domínio Maestro

## Objetivo

Separar o ciclo de desenvolvimento do ambiente real. O trabalho diário acontece no projeto Dev e a produção permanece protegida. O Base44 continua disponível como fallback enquanto a migração não for encerrada.

## Estado configurado

- Branch local de trabalho: `codex/homologacao`.
- Dev: `tqmfuskvllpqmvayjuqu` (projeto `Dominio Maestro`).
- Produção: `fwpisypiiezjhtqxlmqv` (projeto `Maestro BD producao`, São Paulo).
- Ambiente local padrão: usa o projeto Dev em `http://127.0.0.1:4173`.
- O modo Vite `test`, quando usado, também aponta para o Dev; não é um terceiro banco.
- Proteção: o frontend recusa URLs incompatíveis com o ambiente selecionado.
- O repositório remoto atual aponta para `producao-dev/Dominio-Performance-Maestro-app`; nenhum push será feito para esse remoto sem confirmação.

## Configuração dos dois projetos Supabase

1. O projeto `tqmf...` é usado exclusivamente para desenvolvimento e testes.
2. O projeto `fwpis...` é usado exclusivamente pela aplicação publicada.
3. Migrations e Edge Functions novas devem ser aplicadas primeiro no Dev.
4. Segredos do Dev e da produção devem ser configurados separadamente no painel Supabase.
5. Dados de teste não devem ser gravados no projeto de produção.

## Configurar a máquina local

O `.env.local` já deve conter a URL e a chave publicável do projeto Dev:

```text
VITE_MAESTRO_ENV=development
VITE_SUPABASE_URL=https://tqmfuskvllpqmvayjuqu.supabase.co
```

Antes de iniciar, confirme que `VITE_SUPABASE_URL` é a URL do Dev. Os arquivos `.env*` preenchidos são ignorados pelo Git.

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

O KVM2 recebe somente o conteúdo compilado de `dist/`. O código-fonte fica no GitHub e os dados/funções ficam no Supabase.

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
