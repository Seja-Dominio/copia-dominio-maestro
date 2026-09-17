# Projeto MMM — Marketing Mix Model

Worker interno do Projeto MMM para modelagem de marketing mix com dados agregados. Meridian é o modelo oficial; Robyn será usado para validação comparativa e PyMC-Marketing ficará disponível para extensões customizadas. O worker não recebe tokens de anúncios, não consulta o banco diretamente e não armazena observações brutas.

## Contrato de entrada

Cada observação representa um período e uma região opcional:

```json
{
  "time": "2026-01-05",
  "geo": "national",
  "kpi": 1234.5,
  "paid": {
    "meta_ads": {"spend": 120, "impressions": 42000}
  },
  "organic": {
    "instagram": {"impressions": 18000}
  },
  "searches": {"brand": 430},
  "leads": 38,
  "controls": {"holiday": 0}
}
```

O KPI deve ser definido de forma consistente (receita ou conversões). Leads são contexto e não são somados ao KPI automaticamente.

## Segurança e prontidão

- O serviço escuta apenas em `127.0.0.1`.
- O endpoint exige `X-MMM-Service-Token`.
- A consulta ao Supabase ocorre pela Edge Function assinada com HMAC.
- São exigidos, por padrão, 26 períodos distintos, KPI observável e investimento + impressões em pelo menos um canal pago.
- Sem dados suficientes o endpoint retorna `insufficient_data`, sem ROI fictício.

## Execução local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[meridian,test]"
MMM_SERVICE_TOKEN=local-token MMM_ALLOW_INLINE_OBSERVATIONS=true uvicorn app:app --host 127.0.0.1 --port 8090
```

O MCMC fica desligado por padrão. Para uma execução de validação, envie `run_model: true` e ajuste os parâmetros no ambiente.
