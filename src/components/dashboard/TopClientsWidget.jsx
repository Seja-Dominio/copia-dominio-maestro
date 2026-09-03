import { createPageUrl } from "@/utils";
import { Users, ArrowRight } from "lucide-react";

export default function TopClientsWidget({ topClients }) {
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-teal-500 rounded-lg flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Top Clientes — Horas</h3>
        </div>
        <a href={createPageUrl("Reports")} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 no-underline">
          Relatórios <ArrowRight className="w-3 h-3" />
        </a>
      </div>
      {topClients.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Sem dados</div>
      ) : (
        <div className="divide-y divide-border">
          {topClients.slice(0, 7).map((c, i) => {
            const maxMins = topClients[0]?.minutes || 1;
            const pct = Math.round((c.minutes / maxMins) * 100);
            return (
              <div key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-foreground truncate">{c.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs font-bold text-foreground">{c.hours}h</span>
                      {c.cost > 0 && (
                        <span className="text-[10px] font-semibold text-destructive bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded-full">
                          R${c.cost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="px-4 py-2 border-t border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground">Valor = horas × valor/hora do colaborador</p>
      </div>
    </div>
  );
}