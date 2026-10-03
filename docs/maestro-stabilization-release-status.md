# Maestro — estabilização e publicação segura

Atualizado em 03/10/2026. Escopo: frontend Maestro e integridade do banco em trilhas separadas. CXM/CRM externo não faz parte deste goal. Nenhuma migration ou escrita em banco de Produção foi feita.

## Marco e estado atual

| Marco | Estado | Evidência / pendência |
|---|---|---|
| 1. Fixar versão de partida | **Concluído** | O VPS alvo foi confirmado no painel Hostinger: `srv1611248.hstgr.cloud` / `187.127.27.151`. O container `maestro-web` serve `maestro-web:latest`, image ID `sha256:a3aeafc77246b8ec2e76ee178b1d886f4ccc3c9a6c4f99999481143bd248c413`, criado em 05/09/2026. O HTML servido referencia `index-BgAv3X_V.js` e `index-BKd9WA-8.css`; ambos os SHA-256 foram comparados com os arquivos do container e coincidem com os arquivos públicos observados. O container não tem mounts, reinicia `unless-stopped` e publica `127.0.0.1:8081 -> 80`. A fingerprint ED25519 do host, verificada pelo console autenticado Hostinger, coincide com `ssh-keyscan`. A chave pública `maestro-kvm2` do painel coincide por fingerprint com `/Users/grimm/.ssh/maestro-kvm2.pub`; SSH autenticado como root foi confirmado. Rollback planejado: deixar o container atual intacto/parado durante a troca e, se necessário, parar o substituto e iniciar novamente o container `maestro-web` ligado à imagem antiga; ainda não foi ensaiado. |
| 2. Montar recorte de estabilização | **Concluído e publicado** | Branch `codex/maestro-stability-release`. Commits de implementação: `1e7b39e0` sincroniza os fontes com o frontend ativo; `b7fee6c1` contém erro/loading por rota e ajusta CI para o recorte da branch; `2ed08e7e` inclui o harness Playwright. Os commits `cab62368` e `1da03ba8` registram evidências do goal/VPS. Nenhuma migration ou mudança de função Edge foi incluída. O bundle atual em Produção já contém `maestro-core-data` e `read_source=relational`; a reconstrução dos fontes mantém esse comportamento existente, não o introduz pelo patch de isolamento. Push sem force-push; o SHA `1da03ba810136c474f7b7479d2c95bde43f56740` foi confirmado local/remoto antes deste registro documental. |
| 3. Homologar no Dev | **Parcial; gate aberto** | Oito testes Playwright locais passaram (falha de carregamento e renderização em Jobs, Ads Brain, Dashboard e Financeiro), oito testes Node de routing/normalização/ordenação passaram, `npm run build` terminou com código 0 e `git diff --check` passou. O lint global falha com 72 imports não usados em arquivos preexistentes; o lint focado dos componentes novos não acusou erro (o ESLint não aplica configuração a `App.jsx`). `.env.test` aponta para o projeto Dev `tqmfuskvllpqmvayjuqu`, mas não contém usuário/sessão de teste; login e fluxos autenticados ainda não foram verificados. O workflow GitHub `37149149430` falhou antes de executar qualquer step (runner indisponível); não é CI aprovado. A conta GitHub ainda precisa resolver o bloqueio de pagamento/limite já reportado. Rollback ainda não foi ensaiado. |
| 4. Publicar no VPS | **Não iniciado; bloqueado pelos gates** | Sem publicação. Exige CI verde no SHA exato, sessão de teste Dev e ensaio de rollback. O acesso SSH root autenticado está disponível; nenhuma alteração foi feita no VPS. |
| 5. Concluir integridade do banco | **Em andamento, independente do release** | Continuar no branch de reconciliação. A migration histórica `0004_publish_imported_records.sql`, conflitos de ledger/payload, upgrade com snapshot sanitizado representativo e isolamento tenant-aware seguem sem gate final. Dev/Produção não receberam escrita neste goal; não aplicar migration nem reparar ledger para liberar o frontend. Consultar `docs/roadmap-finalizacao-banco-maestro-cxm.md` e `docs/migration-drift-reconciliation.md` para evidências históricas e limites. |

## Próxima sequência segura

1. Habilitar o CI GitHub Actions e confirmar todos os jobs no SHA `1da03ba810136c474f7b7479d2c95bde43f56740`.
2. Disponibilizar uma conta/sessão descartável **somente do Dev** sem enviar senha ou token pelo chat; verificar login, Jobs, Minhas Tarefas, Financeiro e Ads Brain, inclusive a navegação entre uma rota com erro e uma rota saudável.
3. Ensaiar a recuperação do container anterior e guardar evidência antes de publicar.
4. Só então publicar frontend no VPS, sem migrations, confirmar os cinco fluxos e restaurar a imagem/container anterior se qualquer smoke test falhar.
5. Retomar a trilha DB separadamente com upgrade em clone representativo, RLS, constraints e rollback; não tratar replay limpo como prova de upgrade com dados.

## Limitações e observações

- Os oito testes atuais provam contenção de falhas de rota no frontend; não provam isolamento de processo/deploy, backend ou indisponibilidade de dependências compartilhadas.
- O bundle atual contém a referência `maestro-core-data`; preservar esse contrato como parte do baseline de Produção não comprova que a versão da Edge Function em Produção é compatível. A função não foi implantada nem alterada neste goal.
- O diretório `/var/www/html` do host é a página padrão do Nginx e **não** hospeda o Maestro. A aplicação roda no container Docker descrito acima.
- O HTML atualmente servido ainda referencia uma imagem de favicon hospedada em `media.base44.com`. Esse item não foi modificado neste release de estabilização para manter a versão publicada como baseline; acompanhar como limpeza de fornecedor separada.
- Arquivos temporários `known_hosts` em `/tmp` contêm somente a chave pública do host validada pelo console Hostinger, não credenciais privadas.
- Aprendizado operacional deste marco: inventariar a chave SSH já cadastrada no painel e comparar fingerprints resolveu um falso bloqueio causado por cliente sem identidade carregada; a evidência é deste caso único, portanto nenhuma skill foi modificada automaticamente. Esforço ativo não medido.
- `npm ci` reportou vulnerabilidades de dependências; não foi executado `npm audit fix` nem atualização ampla porque isso aumentaria o escopo do release.

## Arquivos e evidências

- Teste: `tests/module-isolation/module-isolation.spec.mjs`
- Wrapper por rota: `src/components/IsolatedModuleContent.jsx` e `src/components/ModuleErrorBoundary.jsx`
- Configuração de teste: `playwright.module-isolation.config.mjs`
- Workflow: `.github/workflows/security-checks.yml`
- CI observado no SHA anterior: <https://github.com/Seja-Dominio/dominio-maestro/actions/runs/37149149430>
- Branch: <https://github.com/Seja-Dominio/dominio-maestro/tree/codex/maestro-stability-release>
