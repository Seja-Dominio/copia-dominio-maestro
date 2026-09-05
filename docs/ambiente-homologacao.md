# Ambiente de homologacao - Dominio Maestro

## Objetivo

Separar o ciclo de testes do ambiente real. A equipe continua usando `https://dominiomaestro.com.br` e o Base44 permanece ativo como fallback. A homologacao deve usar outro projeto Supabase, com dados de teste.

## Estado configurado

- Branch local: `codex/homologacao`.
- Produção: domínio externo no KVM2, usando o projeto Supabase atual.
- Homologação local: preparada para usar o modo Vite `test` na porta `4174`.
- O repositório remoto atual aponta para `producao-dev/Dominio-Performance-Maestro-app`; nenhum push será feito para esse remoto sem confirmação.

## Criar o projeto Supabase de homologação

1. No painel Supabase, crie um novo projeto com nome como `maestro-homologacao`.
2. Guarde a URL e a chave publicável desse novo projeto.
3. Replique o schema/migrations do repositório.
4. Publique as Edge Functions necessárias no projeto de homologação.
5. Crie somente usuários e dados de teste.
6. Configure os segredos das Functions no projeto de homologação; não copie segredos para o Git.

## Configurar a máquina local

Copie `config/env.test.example` para `.env.test` e preencha apenas com os valores do projeto de homologação:

```text
cp config/env.test.example .env.test
```

Antes de iniciar, confirme que `VITE_SUPABASE_URL` não é a URL de produção. O arquivo `.env.test` é ignorado pelo Git.

## Rodar e testar

```text
npm install
npm run dev:test
```

Abra `http://127.0.0.1:4174`.

Para validar o build de homologação:

```text
npm run build:test
npm run preview:test
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

## Pendência necessária para ativar a homologação real

Ainda falta a URL/chave publicável do projeto Supabase separado. Sem esse projeto, o modo `test` está preparado, mas não deve ser executado apontando para a base de produção.
