import { useState } from "react";
import { createPageUrl } from "@/utils";
import { XCircle, AlertTriangle, Calendar, Briefcase, ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { STATUS_CONFIG, CONTENT_ICONS } from "./dashboardConstants";

function JobRow({ job, onJobClick }) {
  const sc = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending_briefing;
  const ContentIcon = CONTENT_ICONS[job.content_type] || Briefcase;
  return (
    <button onClick={() => onJobClick?.(job)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left">
      <ContentIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{job.title}</p>
        <p className="text-[10px] text-muted-foreground">{job.client_name} · Post: {job.post_date ? format(parseISO(job.post_date), "dd/MM", { locale: ptBR }) : "—"}</p>
      </div>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.color} flex-shrink-0`}>{sc.label}</span>
    </button>
  );
}

function Section({ title, icon: Icon, color, borderColor, bgColor, jobs, defaultExpanded = true, onJobClick }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  if (jobs.length === 0) return null;

  const displayed = showAll ? jobs : jobs.slice(0, 5);

  return (
    <div>
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between px-5 py-3 border-b ${borderColor} ${bgColor}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${color}`} />
          <h4 className={`text-xs font-bold ${color}`}>{title} ({jobs.length})</h4>
        </div>
        {expanded ? <ChevronDown className={`w-3.5 h-3.5 ${color}`} /> : <ChevronRight className={`w-3.5 h-3.5 ${color}`} />}
      </button>
      {expanded && (
        <>
          <div className="divide-y divide-border">
            {displayed.map(j => <JobRow key={j.id} job={j} onJobClick={onJobClick} />)}
          </div>
          {jobs.length > 5 && (
            <div className="px-5 py-2 border-t border-border">
              <button onClick={() => setShowAll(v => !v)} className={`text-xs font-semibold hover:underline ${color}`}>
                {showAll ? "← Ver menos" : `Ver mais ${jobs.length - 5}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function OverdueJobsPanel({ overdueJobs, allTeams, overdueTeamFilter, onTeamFilterChange, subtasks = [], todayStr, in5DaysStr, onJobClick }) {
  // 1. Post date atrasada
  const overdueByPost = overdueJobs.filter(j =>
    j.post_date && j.post_date <= todayStr && !["completed", "scheduled", "cancelled"].includes(j.status)
  );

  // 2. Subtasks atrasadas (jobs que NÃO estão já no grupo 1)
  const overduePostIds = new Set(overdueByPost.map(j => j.id));
  const subtaskOverdueJobIds = new Set(
    subtasks
      .filter(s => !s.is_completed && s.deadline && s.deadline <= todayStr)
      .map(s => s.job_id)
      .filter(Boolean)
  );
  const overdueBySubtask = overdueJobs.filter(j =>
    !overduePostIds.has(j.id) && subtaskOverdueJobIds.has(j.id) && !["completed", "scheduled", "cancelled"].includes(j.status)
  );

  // 3. Próximos 5 dias não agendados
  const next5NotScheduled = overdueJobs.filter(j =>
    j.post_date && j.post_date > todayStr && j.post_date <= in5DaysStr && !["scheduled", "completed", "cancelled"].includes(j.status)
  );

  const totalCount = overdueByPost.length + overdueBySubtask.length + next5NotScheduled.length;

  return (
    <div className="bg-card border border-red-200 dark:border-red-800 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-600" />
          <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Resumo de Pendências ({totalCount})</h3>
        </div>
        <select
          className="h-7 rounded-lg border border-red-200 dark:border-red-700 bg-white dark:bg-red-900/30 px-2 text-xs text-red-700 dark:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-400"
          value={overdueTeamFilter}
          onChange={e => onTeamFilterChange(e.target.value)}
        >
          <option value="all">Todas as equipes</option>
          {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
          <option value="none">Sem equipe</option>
        </select>
      </div>

      {totalCount === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Nenhuma pendência encontrada</div>
      ) : (
        <div>
          <Section
            title="Data de post atrasada"
            icon={XCircle}
            color="text-red-600 dark:text-red-400"
            borderColor="border-red-100 dark:border-red-800"
            bgColor="bg-red-50/50 dark:bg-red-900/10"
            jobs={overdueByPost}
            onJobClick={onJobClick}
          />
          <Section
            title="Tarefas atrasadas"
            icon={AlertTriangle}
            color="text-orange-600 dark:text-orange-400"
            borderColor="border-orange-100 dark:border-orange-800"
            bgColor="bg-orange-50/50 dark:bg-orange-900/10"
            jobs={overdueBySubtask}
            onJobClick={onJobClick}
          />
          <Section
            title="Próximos 5 dias — não agendados"
            icon={Calendar}
            color="text-amber-600 dark:text-amber-400"
            borderColor="border-amber-100 dark:border-amber-800"
            bgColor="bg-amber-50/50 dark:bg-amber-900/10"
            jobs={next5NotScheduled}
            defaultExpanded={false}
            onJobClick={onJobClick}
          />
        </div>
      )}
    </div>
  );
}