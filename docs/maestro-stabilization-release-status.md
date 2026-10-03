# Maestro — estabilização e publicação segura

Atualizado em 03/10/2026. Escopo: frontend Maestro e integridade do banco em trilhas separadas. CXM/CRM externo não faz parte deste goal. Nenhuma migration ou escrita em banco de Produção foi feita.

## Marco e estado atual

| Marco | Estado | Evidência / pendência |
|---|---|---|
| 1. Fixar versão de partida | **Concluído** | O VPS alvo foi confirmado no painel Hostinger: `srv1611248.hstgr.cloud` / `187.127.27.151`. O container `maestro-web` serve `maestro-web:latest`, image ID `sha256:a3aeafc77246b8ec2e76ee178b1d886f4ccc3c9a6c4f99999481143bd248c413`, criado em 05/09/2026. O HTML servido referencia `index-BgAv3X_V.js` e `index-BKd9WA-8.css`; ambos os SHA-256 foram comparados com os arquivos do container e coincidem com os arquivos públicos observados. O container não tem mounts, reinicia `unless-stopped` e publica `127.0.0.1:8081 -> 80`. A imagem antiga permanece disponível para restauração; preservar o container/imagem anterior ao trocar a tag. A fingerprint ED25519 do host, verificada pelo console autenticado Hostinger, coincide com `ssh-keyscan`; autenticação SSH ainda falha por falta da chave privada local autorizada. |
| 2. Montar recorte de estabilização | **Concluído e publicado** | Branch `codex/maestro-stability-release`. Três commits: `1e7b39e0` sincroniza os fontes com o frontend ativo; `b7fee6c1` contém erro/loading por rota e ajusta CI para o recorte da branch; `2ed08e7e` inclui o harness Playwright. Nenhuma migration ou mudança de função Edge foi incluída. Push sem force-push; SHA local/remoto confirmado: `2ed08e7ede9a6c09abc517b9f546a26ab2d386c5`. |
| 3. Homologar no Dev | **Parcial; gate aberto** | Oito testes Playwright locais passaram (falha de carregamento e renderização em Jobs, Ads Brain, Dashboard e Financeiro), `npm run build` terminou com código 0 e `git diff --check` passou. `.env.test` aponta para o projeto Dev `tqmfuskvllpqmvayjuqu`, mas não contém usuário/sessão de teste; login e fluxos autenticados ainda não foram verificados. O workflow GitHub `37148744083` falhou antes de executar qualquer step (runner indisponível); não é CI aprovado. A conta GitHub ainda precisa resolver o bloqueio de pagamento/limite já reportado. Rollback ainda não foi ensaiado. |
| 4. Publicar no VPS | **Não iniciado; bloqueado pelos gates** | Sem publicação. Exige CI verde no SHA exato, sessão de teste Dev e ensaio de rollback. A impressão digital do host foi confirmada, mas falta a chave SSH privada autorizada; a única sessão operacional disponível é o console web Hostinger. |
| 5. Concluir integridade do banco | **Em andamento, independente do release** | Continuar no branch de reconciliação. A migration histórica `0004_publish_imported_records.sql`, conflitos de ledger/payload, upgrade com snapshot sanitizado representativo e isolamento tenant-aware seguem sem gate final. Dev/Produção não receberam escrita neste goal; não aplicar migration nem reparar ledger para liberar o frontend. Consultar `docs/roadmap-finalizacao-banco-maestro-cxm.md` e `docs/migration-drift-reconciliation.md` para evidências históricas e limites. |

## Próxima sequência segura

1. Habilitar o CI GitHub Actions e confirmar todos os jobs no SHA `2ed08e7ede9a6c09abc517b9f546a26ab2d386c5`.
2. Disponibilizar uma conta/sessão descartável **somente do Dev** sem enviar senha ou token pelo chat; verificar login, Jobs, Minhas Tarefas, Financeiro e Ads Brain, inclusive a navegação entre uma rota com erro e uma rota saudável.
3. Ensaiar a recuperação do container anterior e guardar evidência antes de publicar.
4. Só então publicar frontend no VPS, sem migrations, confirmar os cinco fluxos e restaurar a imagem/container anterior se qualquer smoke test falhar.
5. Retomar a trilha DB separadamente com upgrade em clone representativo, RLS, constraints e rollback; não tratar replay limpo como prova de upgrade com dados.

## Limitações e observações

- Os oito testes atuais provam contenção de falhas de rota no frontend; não provam isolamento de processo/deploy, backend ou indisponibilidade de dependências compartilhadas.
- O diretório `/var/www/html` do host é a página padrão do Nginx e **não** hospeda o Maestro. A aplicação roda no container Docker descrito acima.
- O HTML atualmente servido ainda referencia uma imagem de favicon hospedada em `media.base44.com`. Esse item não foi modificado neste release de estabilização para manter a versão publicada como baseline; acompanhar como limpeza de fornecedor separada.
- Foi criado um arquivo temporário de `known_hosts` em `/tmp` para a conexão com fingerprint verificada; não contém chave privada. O acesso SSH continuou negado por ausência de chave privada correspondente.
- `npm ci` reportou vulnerabilidades de dependências; não foi executado `npm audit fix` nem atualização ampla porque isso aumentaria o escopo do release.

## Arquivos e evidências

- Teste: `tests/module-isolation/module-isolation.spec.mjs`
- Wrapper por rota: `src/components/IsolatedModuleContent.jsx` e `src/components/ModuleErrorBoundary.jsx`
- Configuração de teste: `playwright.module-isolation.config.mjs`
- Workflow: `.github/workflows/security-checks.yml`
- CI no SHA publicado: <https://github.com/Seja-Dominio/dominio-maestro/actions/runs/37148744083>
- Branch: <https://github.com/Seja-Dominio/dominio-maestro/tree/codex/maestro-stability-release>
