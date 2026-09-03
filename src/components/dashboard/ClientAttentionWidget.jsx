import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Loader2, RefreshCw, ExternalLink, Camera, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

function normalizeForMatch(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function ClientAttentionWidget({ clientsAtRisk, scheduleBreaches }) {
  const [aiResult, setAiResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const generate = async () => {
    if (!clientsAtRisk || clientsAtRisk.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const breachMap = {};
      (scheduleBreaches || []).forEach(s => { breachMap[s.name] = s; });

      const summary = clientsAtRisk.map(c => {
        const breach = breachMap[c.name];
        return {
          cliente: c.name,
          jobs_atrasados: c.overdueJobsCount,
          subtarefas_atrasadas: c.overdueSubtasksCount,
          captacao_pendente_sem_agendamento: c.captacaoPendingSemAgenda,
          mudancas_data_postagem: breach?.dateChanges || 0,
          jobs_cancelados: breach?.cancelled || 0,
        };
      });

      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um consultor de gestão de agências de marketing digital. Analise estes clientes que precisam de atenção urgente e dê recomendações práticas para o administrador.

Dados dos clientes em risco:
${JSON.stringify(summary, null, 2)}

Regras:
- "jobs_atrasados": quantidade de jobs com data de postagem vencida
- "subtarefas_atrasadas": quantidade de tarefas internas atrasadas
- "captacao_pendente_sem_agendamento": true se há tarefa de captação pendente mas nenhuma captação agendada no futuro
- "mudancas_data_postagem": quantidade de vezes que a data de postagem foi alterada — PONTO CRÍTICO pois quebra a confiança do cliente no cronograma
- "jobs_cancelados": quantidade de jobs cancelados — situação extrema que fragiliza a relação
- O resumo deve focar em recomendar ações para os COLABORADORES/USUÁRIOS que possuem mais tarefas em atraso, sugerindo redistribuição de carga ou priorização
- Se um cliente tem muitas mudanças de data ou cancelamentos, ALERTE com urgência que isso prejudica a confiança no cronograma
- Máximo 3 frases no resumo geral
- OBRIGATÓRIO: gere exatamente uma recomendação para CADA cliente da lista (${summary.length} no total)
- Ordene do mais crítico para o menos crítico
- Para cada recomendação, seja direto em 1 frase no motivo e 1 frase na ação`,
        response_json_schema: {
          type: "object",
          properties: {
            resumo: { type: "string" },
            recomendacoes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cliente: { type: "string" },
                  motivo: { type: "string" },
                  acao_sugerida: { type: "string" },
                },
              },
            },
          },
        },
      });
      setAiResult(res);
    } catch (err) {
      console.error("Erro ao gerar resumo IA:", err);
      setError("Não foi possível gerar o resumo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientsAtRisk?.length > 0 && !aiResult && !loading) generate();
  }, [clientsAtRisk?.length]);

  if (!clientsAtRisk || clientsAtRisk.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Atenção aos Clientes</h3>
        </div>
        <p className="text-xs text-muted-foreground">Todos os clientes estão em dia! Nenhum alerta no momento.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Atenção aos Clientes</h3>
            <p className="text-[10px] text-muted-foreground">{clientsAtRisk.length} cliente{clientsAtRisk.length !== 1 ? "s" : ""} precisando de atenção</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={generate} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Analisando clientes com IA...
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {aiResult && !loading && (
        <>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
            <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">{aiResult.resumo}</p>
          </div>

          <div className={`space-y-2 ${(aiResult.recomendacoes || []).length > 5 ? "max-h-[360px] overflow-y-auto pr-1" : ""}`}>
            {(aiResult.recomendacoes || []).map((rec, i) => {
              const matchedClient = clientsAtRisk.find(c => normalizeForMatch(c.name).includes(normalizeForMatch(rec.cliente)) || normalizeForMatch(rec.cliente).includes(normalizeForMatch(c.name)));
              return (
                <div
                  key={i}
                  className="border-l-4 border-amber-400 bg-muted/30 rounded-lg p-3 cursor-pointer hover:bg-muted/60 transition-colors group"
                  onClick={() => matchedClient?.client_id && navigate(`/Jobs?client=${matchedClient.client_id}`)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground">{rec.cliente}</span>
                    <div className="flex items-center gap-1.5">
                      {matchedClient?.captacaoPendingSemAgenda && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-semibold flex items-center gap-0.5">
                          <Camera className="w-2.5 h-2.5" /> Captação
                        </span>
                      )}
                      {(matchedClient?.overdueJobsCount || 0) > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-semibold flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> {matchedClient.overdueJobsCount} atraso{matchedClient.overdueJobsCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed"><strong>Motivo:</strong> {rec.motivo}</p>
                  <p className="text-[11px] text-primary font-medium mt-0.5">→ {rec.acao_sugerida}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!aiResult && !loading && !error && (
        <div className="space-y-2">
          {clientsAtRisk.slice(0, 5).map((c) => (
            <div
              key={c.client_id}
              className="border-l-4 border-amber-400 bg-muted/30 rounded-lg p-3 cursor-pointer hover:bg-muted/60 transition-colors"
              onClick={() => navigate(`/Jobs?client=${c.client_id}`)}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{c.name}</span>
                <div className="flex gap-1">
                  {c.captacaoPendingSemAgenda && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold">Captação pendente</span>}
                  {c.overdueJobsCount > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{c.overdueJobsCount} atraso{c.overdueJobsCount !== 1 ? "s" : ""}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}