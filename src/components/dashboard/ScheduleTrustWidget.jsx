import { useMemo, useState } from "react";
import { CalendarX2, AlertOctagon, ChevronDown, ChevronUp, Ban, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ScheduleTrustWidget({ scheduleBreaches }) {
  const [expandedClient, setExpandedClient] = useState(null);

  const stats = useMemo(() => {
    return (scheduleBreaches || [])
      .map(s => ({ ...s, total: (s.dateChanges || 0) + (s.cancelled || 0) }))
      .sort((a, b) => b.total - a.total);
  }, [scheduleBreaches]);

  const toggle = (clientId) => {
    setExpandedClient(prev => prev === clientId ? null : clientId);
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    try { return format(parseISO(d), "dd/MM/yy", { locale: ptBR }); } catch { return d; }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-red-600 rounded-xl flex items-center justify-center">
          <AlertOctagon className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Confiança no Cronograma</h3>
          <p className="text-[10px] text-muted-foreground">Mudanças de data e cancelamentos quebram a confiança do cliente</p>
        </div>
      </div>

      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
        <p className="text-[11px] text-red-800 dark:text-red-200 leading-relaxed">
          <strong>⚠️ Ponto crítico:</strong> Alterar datas de postagem ou cancelar jobs é uma situação extrema — cada mudança fragiliza a confiança do cliente no cronograma e na capacidade de entrega da agência. Priorize replanejamento preventivo.
        </p>
      </div>

      {stats.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">Nenhuma alteração de data ou cancelamento registrado.</p>
      ) : (
        <div className={`space-y-1 ${stats.length > 6 ? "max-h-[450px] overflow-y-auto pr-1" : ""}`}>
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_80px_70px] gap-2 px-3 py-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">Cliente</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Datas alt.</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Cancelados</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase text-center">Total</span>
          </div>
          {stats.map(s => {
            const isExpanded = expandedClient === s.client_id;
            // Detect jobs moved more than once
            const jobMoveCounts = {};
            (s.dateChangeJobs || []).forEach(j => {
              jobMoveCounts[j.id] = (jobMoveCounts[j.id] || 0) + 1;
            });

            return (
              <div key={s.client_id}>
                <div
                  className="grid grid-cols-[1fr_80px_80px_70px] gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted/60 cursor-pointer transition-colors items-center"
                  onClick={() => toggle(s.client_id)}
                >
                  <div className="flex items-center gap-1.5">
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                    <span className="text-xs font-semibold text-foreground truncate">{s.name}</span>
                  </div>
                  <div className="flex justify-center">
                    {s.dateChanges > 0 ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 font-bold flex items-center gap-0.5">
                        <CalendarX2 className="w-2.5 h-2.5" /> {s.dateChanges}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {s.cancelled > 0 ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-bold">
                        {s.cancelled}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <span className={`text-xs font-black ${s.total >= 5 ? "text-red-600" : s.total >= 3 ? "text-amber-600" : "text-foreground"}`}>
                      {s.total}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="ml-6 mr-2 mt-1 mb-2 border-l-2 border-border pl-3 space-y-3">
                    {s.dateChangeJobs?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1.5 flex items-center gap-1">
                          <CalendarX2 className="w-3 h-3" /> Jobs com data alterada
                        </p>
                        <div className="space-y-1">
                          {s.dateChangeJobs.map((j, idx) => {
                            const isRepeated = jobMoveCounts[j.id] > 1;
                            return (
                              <div key={`${j.id}-${idx}`} className={`flex items-center gap-2 text-[11px] py-1 px-2 rounded ${isRepeated ? "bg-orange-50 dark:bg-orange-900/15 border border-orange-200 dark:border-orange-800" : ""}`}>
                                {isRepeated && <AlertTriangle className="w-3 h-3 text-orange-600 flex-shrink-0" />}
                                <span className="truncate flex-1 font-medium text-foreground">{j.title}</span>
                                <span className="text-[10px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                                  {fmtDate(j.old_value)} → {fmtDate(j.new_value)}
                                </span>
                                {j.user && <span className="text-[9px] text-muted-foreground flex-shrink-0 italic">({j.user})</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {s.cancelledJobs?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-red-700 dark:text-red-300 uppercase mb-1.5 flex items-center gap-1">
                          <Ban className="w-3 h-3" /> Jobs cancelados
                        </p>
                        <div className="space-y-1">
                          {s.cancelledJobs.map(j => (
                            <div key={j.id} className="flex items-center gap-2 text-[11px] py-1 px-2">
                              <span className="truncate flex-1 line-through opacity-70">{j.title}</span>
                              <span className="text-muted-foreground text-[10px] flex-shrink-0">{fmtDate(j.post_date)}</span>
                              {j.user && <span className="text-[9px] text-muted-foreground flex-shrink-0 italic">({j.user})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}