# Projeto MMM

## Decisão de arquitetura

| Camada | Responsabilidade | Regra |
|---|---|---|
| Meridian | Modelo oficial | Estimar contribuição, ROI, saturação e projeções quando houver histórico suficiente. |
| Robyn | Validação comparativa | Rodar como comparação metodológica, nunca substituir automaticamente o modelo oficial. |
| Hermes / Dominus | Interpretação e aconselhamento | Traduzir resultados em linguagem direta, separar fatos de estimativas e sugerir decisões. |
| Maestro | Dados e permissões | Consultar fontes autorizadas, filtrar escopo e impedir exposição de dados sensíveis. |
| PyMC-Marketing | Extensões customizadas | Usar apenas quando o caso exigir uma especificação que Meridian não cubra. |

## Primeiro marco

1. Persistir observações agregadas por período, região e cliente.
2. Validar cobertura, consistência do KPI e investimento por canal.
3. Rodar Meridian em ambiente de desenvolvimento.
4. Comparar resultados com Robyn em um conjunto controlado.
5. Entregar ao Dominus somente um resumo estruturado, sem dados brutos.

O projeto não deve gerar ROI, influência ou projeção quando a série histórica não for suficiente. O resultado correto nesse caso é informar a limitação e indicar quais dados precisam ser coletados.
