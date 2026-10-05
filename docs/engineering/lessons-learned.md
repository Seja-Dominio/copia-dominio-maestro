# Lições de engenharia

## 2026-10-05 — Diretórios temporários de ensaios de release

- **Contexto:** ensaio local de build e rollback do frontend do Maestro.
- **Evidência:** uma extração inicial para `/tmp` colocou arquivos versionados em um destino compartilhado; uma tentativa subsequente também criou uma symlink no diretório de trabalho. A symlink conhecida foi removida. Não foi possível determinar se arquivos preexistentes de `/tmp` foram substituídos nem recuperar seu conteúdo anterior.
- **Causa confirmada:** o destino não foi criado e validado como diretório exclusivo antes de extrair o arquivo do Git; na primeira execução da simulação, a raiz do laboratório também não foi passada explicitamente ao processo.
- **Regra operacional:** antes de extrair/buildar, criar uma pasta exclusiva com `mktemp -d`, imprimir e validar seu caminho, passar esse caminho explicitamente ao processo e confirmar o diretório de trabalho. Manter symlinks de troca dentro dessa pasta. Nunca extrair arquivos versionados diretamente em `/tmp`, no checkout ou em diretório compartilhado.
- **Impacto/recuperação:** não houve mudança no Git rastreado, VPS ou banco. Conteúdo anterior possivelmente substituído em `/tmp` permanece indeterminado; não executar limpeza ou restauração especulativa.
- **Esforço:** não medido.
