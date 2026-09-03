import { useState } from "react";
import { createPageUrl } from "@/utils";
import { XCircle, AlertCircle, Briefcase } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { STATUS_CONFIG, CONTENT_ICONS } from "./dashboardConstants";

export default function MyOverduePanel({ myOverdueJobs, onJobClick }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card border border-red-200 dark:border-red-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <XCircle className="w-4 h-4 text-red-600" />
        <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Minhas Entregas Atrasadas ({myOverdueJobs.length})</h3>
      </div>
      {myOverdueJobs.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-1">
          <AlertCircle className="w-6 h-6 opacity-30" />
          Nenhuma entrega atrasada
        </div>
      ) : (
        <div className="divide-y divide-border">
          {(expanded ? myOverdueJobs : myOverdueJobs.slice(0, 5)).map(j => {
            const sc = STATUS_CONFIG[j.status] || STATUS_CONFIG.pending_briefing;
            const ContentIcon = CONTENT_ICONS[j.content_type] || Briefcase;
            return (
              <button key={j.id} onClick={() => onJobClick?.(j)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left">
                <ContentIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{j.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {j.client_name} · Post: {j.post_date ? format(parseISO(j.post_date), "dd/MM", { locale: ptBR }) : "—"}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.color} flex-shrink-0`}>{sc.label}</span>
              </button>
            );
          })}
        </div>
      )}
      {myOverdueJobs.length > 5 && (
        <div className="px-5 py-3 border-t border-border">
          <button onClick={() => setExpanded(v => !v)} className="text-xs text-red-600 font-semibold hover:underline">
            {expanded ? "← Ver menos" : `Ver mais ${myOverdueJobs.length - 5}`}
          </button>
        </div>
      )}
    </div>
  );
}