# Migração do Maestro para infraestrutura externa

## Estado atual

- Origem: Base44, repositório `Seja-Dominio/copia-dominio-maestro`.
- Frontend: React + Vite.
- Dados atuais: cópia idempotente no Supabase, com zona de aterrissagem `migration.base44_records`; o Base44 permanece ativo e intocado.
- Colaboradores: 13 registros preservados em `public.collaborators`, incluindo níveis de acesso.
- Entidades identificadas: 32.
- Funções backend identificadas: 21.
- Integrações identificadas: Google Drive, Instagram/Meta, WhatsApp/Z-API e serviços de e-mail/IA.
- Exportação por arquivo não foi necessária: os registros foram lidos pela API autenticada do Base44 e gravados no Supabase. A cópia pode ser repetida sem duplicação.

## Destino planejado

- Frontend: Hostinger.
- Banco: PostgreSQL no Supabase.
- Autenticação: Supabase Auth, com compatibilidade para colaboradores existentes.
- Arquivos: Supabase Storage ou Google Drive, conforme a origem de cada arquivo.
- Backend: Supabase Edge Functions para regras que hoje estão em `base44/functions`.
- Segredos: variáveis protegidas do ambiente, nunca no código ou no Git.

## Ordem de execução

1. Criar o schema externo sem remover nem alterar dados do Base44. **Concluído.**
2. Importar uma cópia dos registros com IDs e referências preservados. **Em andamento por páginas idempotentes.**
3. Validar contagens, campos críticos e permissões. **Parcial: landing zone e permissões de banco validadas.**
4. Adicionar um adaptador de leitura compatível e testar em ambiente separado. **Concluído no código; ativação depende das variáveis Supabase.**
5. Migrar gravações e funções por domínio, com logs e reprocessamento seguro.
6. Alternar o frontend para o destino externo.
7. Manter o Base44 disponível durante a janela de validação e só depois avaliar o desligamento.

## Rollback

O rollback consiste em restaurar o adaptador para Base44 e manter o Supabase como cópia não destrutiva. Nenhuma etapa desta pasta autoriza apagar registros, arquivos ou o aplicativo original.

## Bloqueios para a migração de dados

- Autenticação Supabase ainda precisa criar/vincular os usuários; hashes legados não devem ser expostos ao navegador.
- Grandes entidades ainda precisam terminar a paginação/importação antes do teste de paridade final.
- O Base44 não será desligado como parte desta migração; qualquer eventual decisão futura será separada e explícita.

## Última validação de cópia

- JobHistory: 5.000 registros confirmados.
- NpsHistory: 359 registros confirmados na zona de aterrissagem nesta etapa.
- Notification: 150 registros confirmados nesta etapa.
- Subtask: 200 registros confirmados nesta etapa.
- Credenciais das integrações externas ainda precisam ser configuradas como segredos.
