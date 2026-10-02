# Auditoria para remoção do Base44

Data da inspeção: 02/10/2026. Escopo: checkout ativo, sem incluir `base44-source/` na busca de runtime. Nenhum deploy, banco ou dado foi alterado nesta auditoria. As alterações desta etapa ficam restritas à branch de trabalho Dev.

## Fatos confirmados

- `src/api/maestroClient.js` é a fronteira consumida pela aplicação. `VITE_MAESTRO_DATA_PROVIDER` agora assume `supabase` quando ausente e rejeita valores desconhecidos; `base44` só pode ser selecionado explicitamente. Isso remove a seleção implícita do backend legado, mas não remove ainda o SDK/fallbacks explicitamente preservados.
- Correção desta etapa: o router ativo usa `src/components/AuthContext.jsx` e `src/components/auth/ProtectedRoute.jsx`; esse fluxo já é de colaborador e foi consolidado no endpoint Supabase `collaborator-login`, que entrega sessão HMAC. O ramo que aceitava JWT nativo do Supabase foi removido porque as Edge Functions protegidas validam HMAC, não JWT nativo, e a consulta agregada read-only encontrou zero usuários `auth.users` no Dev e em Produção. A sessão local agora exige token não expirado com `sub`, ID de colaborador e organização coerentes; o servidor continua sendo a autoridade que valida HMAC/membership.
- Os arquivos `src/lib/AuthContext.jsx`, `src/components/ProtectedRoute.jsx` e páginas antigas de registro/recuperação/OAuth não são montados pelo router atual; ainda contêm referências a auth Base44 e devem ser classificados/removidos em uma etapa separada, sem confundi-los com o fluxo ativo.
- O adaptador Supabase ainda expõe `base44.auth`, `base44.functions` e `base44.integrations` para compatibilidade. `invokeMaestroFunction` encaminha para o SDK quando uma ação não está implementada no caminho Supabase. Portanto, retirar só a dependência NPM ou trocar os defaults continua insuficiente e pode quebrar ações.
- `@base44/sdk` está em `package.json`/lockfile e é importado pelo `src/api/base44Client.js`. Há referência de runtime a assets remotos em `media.base44.com` no favicon e em componentes de marca/exportação.
- Há 21 arquivos em `base44/functions/`: código legado de backend cuja equivalência com Edge Functions atuais ainda precisa ser cruzada função a função. Não assumir que seja dead code sem conferir deploy e consumidores.
- `base44-source/` contém 315 arquivos de snapshot histórico. Não há import do diretório pelo build, mas ele preserva implementação e pode servir de fonte de paridade. A busca encontrou 677 linhas com referências nesse snapshot; isso não equivale a chamadas do app atual.
- Duas migrations históricas mencionam Base44, incluindo a importação de `migration.base44_records` para `legacy_records`. Migrations já aplicadas são trilha histórica; não editar ou renomear para apagar palavras. A ferramenta `scripts/import-base44-export.mjs` e orientações antigas no README/config também continuam no checkout.
- Verificações locais atuais: mapa funcional OK (20 rotas, 32 entidades, 119 operações inventariadas); fronteiras de módulos OK; gate de funções Edge retorna `release_ready=false`, com 6 funções compartilhadas e 8 não-CXM pendentes. Isso demonstra que a remoção integral não está provada.

## Ordem segura para concluir

1. Mapear cada operação de `maestroClient`/cada entidade e método auth à implementação Supabase/Edge, verificando paridade de sucesso, erro e permissões; listar qualquer consumidor sem substituto. Auth HMAC passou seu gate de forma local; falta E2E autenticado em homologação.
2. Remover os fallbacks de runtime por domínio somente depois dos contratos e testes de fluxo; não substituir chamadas pendentes por sucesso vazio. Permanecem sem destino Supabase: `deleteAccount`, `fetchInstagramInsights` e `generateAIInsights`.
3. Migrar os fluxos de autenticação e os ativos de marca para recursos locais, com testes de login, sessão, recuperação, rotas protegidas e logout.
4. Retirar `@base44/sdk`, `base44Client`, parâmetros/proxies/envs e configuração do Docker, executando build e regressões com variáveis ausentes e com Dev/Prod explicitamente configurados.
5. Desativar os antigos handlers em `base44/functions/` apenas após inventário de publicação e prova de equivalência das rotas Edge; preservar export/import apenas se ainda houver obrigação operacional de recuperação.
6. Tratar snapshots e migrations como arquivo histórico separado. Só eliminar o snapshot ou tooling de import com confirmação de retenção/backup e após provar que não é necessário para recuperação; manter imutáveis as migrations já aplicadas.

## Gate de conclusão

Busca no runtime/build/config/documentação operacional sem dependência Base44; nenhuma rota, entidade, auth ou integração cai em fallback; testes de paridade e autorização passam; `@base44/sdk` e endpoints/ativos remotos não aparecem no bundle; handlers antigos têm disposição documentada. Snapshot e migrations históricas são excluídos do gate de runtime e permanecem preservados até decisão explícita de retenção.
