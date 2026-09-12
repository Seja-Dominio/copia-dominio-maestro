import { useMemo, useState } from "react";
import { createPageUrl } from "@/utils";
import { Calendar, CalendarDays, ArrowRight, Briefcase } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { STATUS_CONFIG, CONTENT_ICONS } from "./dashboardConstants";
import { normalizeWorkflowStatus } from "@/lib/jobWorkflow";

export default function NextPostsPanel({ dayGroups, todayStr, onJobClick }) {
  const [expandedDates, setExpandedDates] = useState({});
  const summary = useMemo(() => {
    const jobs = dayGroups.flatMap(group => group.jobs || []);
    return {
      scheduled: jobs.filter(job => normalizeWorkflowStatus(job.status) === "scheduled").length,
      notScheduled: jobs.filter(job => !["scheduled", "completed", "cancelled"].includes(normalizeWorkflowStatus(job.status))).length,
    };
  }, [dayGroups]);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Postagens — hoje e próximos 5 dias</h3>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5 text-green-600 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            {summary.scheduled} agendados
          </span>
          <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            {summary.notScheduled} não agendados
          </span>
        </div>
      </div>

      {dayGroups.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground text-sm">
          <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
          Nenhuma postagem nos próximos 5 dias
        </div>
      ) : (
        <div className="divide-y divide-border">
          {dayGroups.map(({ date, dateStr, jobs: dayJobs }) => {
            const isToday = dateStr === todayStr;
            const isExpanded = expandedDates[dateStr];
            const visibleJobs = isExpanded ? dayJobs : dayJobs.slice(0, 3);
            const hasMore = dayJobs.length > 3;
            return (
              <div key={dateStr} className={`px-5 py-3 ${isToday ? "bg-primary/5" : ""}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {isToday ? "Hoje" : format(date, "EEE, dd/MM", { locale: ptBR })}
                  </span>
                  <span className="text-xs text-muted-foreground">({dayJobs.length} post{dayJobs.length > 1 ? "s" : ""})</span>
                </div>
                <div className="space-y-1.5">
                  {visibleJobs.map(j => {
                    const sc = STATUS_CONFIG[j.status] || STATUS_CONFIG.pending_briefing;
                    const ContentIcon = CONTENT_ICONS[j.content_type] || Briefcase;
                    const normalizedStatus = normalizeWorkflowStatus(j.status);
                    const isCompletedOrScheduled = ["scheduled", "completed"].includes(normalizedStatus);
                    const statusLabel = isCompletedOrScheduled ? (normalizedStatus === "completed" ? "Concluída" : "Agendada") : "Pendente";
                    return (
                      <button type="button" key={j.id} onClick={() => onJobClick?.(j)} aria-label={`${j.title || "Job sem título"} — ${j.client_name || "Sem cliente"} — ${j.stage_title || "Etapa não identificada"} — ${statusLabel}`} className={`group w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isCompletedOrScheduled ? "border-green-300 bg-green-200 hover:bg-green-300 dark:border-green-800 dark:bg-green-900/50 dark:hover:bg-green-900/70" : "border-red-300 bg-red-200 hover:bg-red-300 dark:border-red-800 dark:bg-red-900/50 dark:hover:bg-red-900/70"}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isCompletedOrScheduled ? "bg-green-100" : "bg-red-100"}`}>
                          <ContentIcon className={`w-3.5 h-3.5 ${isCompletedOrScheduled ? "text-green-600" : "text-red-600"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{j.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{j.client_name}{j.stage_title ? ` · ${j.stage_title}` : ""}{j.stage_responsible_name ? ` · ${j.stage_responsible_name}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.color}`}>{sc.label}</span>
                          {(j.stage_responsible_name || j.responsible_name) && (
                            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-[9px] font-bold">
                              {(j.stage_responsible_name || j.responsible_name)[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {hasMore && (
                  <button type="button" onClick={() => setExpandedDates(prev => ({ ...prev, [dateStr]: !isExpanded }))} className="mt-2 rounded-md text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                    {isExpanded ? "← Ver menos" : `Ver mais ${dayJobs.length - 3}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="px-5 py-3 border-t border-border">
        <a href={createPageUrl("Jobs")} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline no-underline">
          Ver pauta completa <ArrowRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
