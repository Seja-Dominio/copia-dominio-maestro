# Migração do Maestro para infraestrutura externa

## Estado atual

- Origem: Base44, repositório `Seja-Dominio/copia-dominio-maestro`.
- Frontend: React + Vite.
- Dados e autenticação atuais: SDK/API do Base44.
- Entidades identificadas: 32.
- Funções backend identificadas: 21.
- Integrações identificadas: Google Drive, Instagram/Meta, WhatsApp/Z-API e serviços de e-mail/IA.
- Exportação de registros: ainda pendente; o ZIP disponível contém código, não dados.

## Destino planejado

- Frontend: Hostinger.
- Banco: PostgreSQL no Supabase.
- Autenticação: Supabase Auth, com compatibilidade para colaboradores existentes.
- Arquivos: Supabase Storage ou Google Drive, conforme a origem de cada arquivo.
- Backend: Supabase Edge Functions para regras que hoje estão em `base44/functions`.
- Segredos: variáveis protegidas do ambiente, nunca no código ou no Git.

## Ordem de execução

1. Criar o schema externo sem remover nem alterar dados do Base44.
2. Importar uma cópia dos registros com IDs e referências preservados.
3. Validar contagens, campos críticos e permissões.
4. Adicionar um adaptador de leitura compatível e testar em ambiente separado.
5. Migrar gravações e funções por domínio, com logs e reprocessamento seguro.
6. Alternar o frontend para o destino externo.
7. Manter o Base44 disponível durante a janela de validação e só depois avaliar o desligamento.

## Rollback

O rollback consiste em restaurar o adaptador para Base44 e manter o Supabase como cópia não destrutiva. Nenhuma etapa desta pasta autoriza apagar registros, arquivos ou o aplicativo original.

## Bloqueios para a migração de dados

- Projeto Supabase de destino ainda não conectado.
- Exportação de dados do Base44 ainda não fornecida.
- Credenciais das integrações externas ainda precisam ser configuradas como segredos.
