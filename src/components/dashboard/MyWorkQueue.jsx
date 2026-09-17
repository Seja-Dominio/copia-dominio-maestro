import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ListTodo } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isClosedJob, normalizeWorkflowStatus } from "@/lib/jobWorkflow";
import { getCurrentStageSubtask } from "@/lib/deliveryMetrics";
import { createPageUrl } from "@/utils";
import NextPostsPanel from "@/components/dashboard/NextPostsPanel";

const MAX_VISIBLE = 4;

function formatDeadline(date) {
  if (!date) return "Sem prazo";
  return format(parseISO(date), "dd/MM", { locale: ptBR });
}

function QueueItem({ item, responsibleName, onJobClick }) {
  const isCompletedOrScheduled = ["scheduled", "completed"].includes(normalizeWorkflowStatus(item.job.status));
  const toneClasses = isCompletedOrScheduled
    ? "border-green-300 bg-green-200 hover:bg-green-300 dark:border-green-800 dark:bg-green-900/50 dark:hover:bg-green-900/70"
    : "border-red-300 bg-red-200 hover:bg-red-300 dark:border-red-800 dark:bg-red-900/50 dark:hover:bg-red-900/70";
  return (
    <button
      type="button"
      onClick={() => onJobClick?.(item.job)}
      aria-label={`${item.job.title || "Job sem título"} — ${item.job.client_name || "Sem cliente"} — ${item.subtask?.title || "Etapa não identificada"} — ${responsibleName || "Sem responsável"} — postagem ${item.job.post_date ? formatDeadline(item.job.post_date) : "sem data"}`}
      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${toneClasses}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-foreground">{item.job.title || "Job sem título"}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {item.job.client_name || "Sem cliente"} · {item.subtask?.title || "Etapa não identificada"} · {responsibleName || "Sem responsável"}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        {item.job.post_date ? formatDeadline(item.job.post_date) : "—"}
        <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}

function QueueSection({ title, count, icon: Icon, tone, items, collaboratorsById, onJobClick, progress }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, MAX_VISIBLE);
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone === "danger" ? "text-red-600" : "text-amber-600"}`} />
        <h4 className="text-xs font-bold text-foreground">{title}</h4>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{count}</span>
      </div>
      {progress && (
        <div className="space-y-1.5" aria-label={`${progress.completed} de ${progress.total} postagens do dia concluídas ou agendadas`}>
          <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-muted-foreground">
            <span>Progresso do dia</span>
            <span className="font-semibold text-foreground">{progress.completed}/{progress.total}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin="0" aria-valuemax={progress.total} aria-valuenow={progress.completed} aria-label="Progresso das postagens de hoje">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {progress.completed === progress.total ? "Todas organizadas para hoje." : `${progress.remaining} ${progress.remaining === 1 ? "postagem pendente" : "postagens pendentes"}.`}
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        {visible.map(item => (
          <QueueItem
            key={item.job.id}
            item={item}
            responsibleName={item.subtask?.responsible_name || collaboratorsById.get(item.subtask?.responsible_id)?.name || item.job.responsible_name}
            onJobClick={onJobClick}
          />
        ))}
      </div>
      {items.length > MAX_VISIBLE && (
        <button type="button" onClick={() => setExpanded(value => !value)} className="rounded-md text-[11px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          {expanded ? "Mostrar menos" : `Ver mais ${items.length - MAX_VISIBLE}`}
        </button>
      )}
    </div>
  );
}

export default function MyWorkQueue({ subtasks, allSubtasks, jobs, collaborators = [], todayStr, upcomingPosts, onJobClick, agencyView = false }) {
  const collaboratorsById = useMemo(() => new Map(collaborators.map(collaborator => [collaborator.id, collaborator])), [collaborators]);
  const queue = useMemo(() => {
    // A queue card represents the current stage of a job. Older open stages
    // remain useful in reports, but must not look like separate jobs here.
    const subtasksByJob = new Map();
    (allSubtasks || subtasks).forEach(subtask => {
      if (!subtasksByJob.has(subtask.job_id)) subtasksByJob.set(subtask.job_id, []);
      subtasksByJob.get(subtask.job_id).push(subtask);
    });
    const items = jobs
      .map(job => ({ job, subtask: getCurrentStageSubtask(job.id, subtasksByJob.get(job.id) || []) }))
      .filter(item => item.job.post_date && item.job.status !== "cancelled");

    const oldestFirst = (left, right) => {
      const postDateOrder = String(left.job.post_date || "9999-12-31").localeCompare(String(right.job.post_date || "9999-12-31"));
      if (postDateOrder !== 0) return postDateOrder;
      return String(left.job.id).localeCompare(String(right.job.id));
    };

    return {
      overdue: items.filter(item => item.job.post_date < todayStr && !isClosedJob(item.job)).sort(oldestFirst),
      today: items.filter(item => item.job.post_date === todayStr).sort(oldestFirst),
    };
  }, [subtasks, allSubtasks, jobs, todayStr]);

  const total = queue.overdue.length + queue.today.length;
  const pendingPostCount = useMemo(
    () => new Set([...queue.overdue, ...queue.today].map(item => item.job.id)).size,
    [queue],
  );
  const todayProgress = useMemo(() => {
    const total = queue.today.length;
    const completed = queue.today.filter(({ job }) => ["scheduled", "completed"].includes(normalizeWorkflowStatus(job.status))).length;
    return {
      total,
      completed,
      remaining: total - completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [queue.today]);
  const hasUpcomingPosts = upcomingPosts?.dayGroups?.length > 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">{agencyView ? "Fila de trabalho da agência" : "Minha fila de trabalho"}</h3>
            <p className="text-xs text-muted-foreground">
              {agencyView
                ? `${total} postagens exigem atenção da equipe`
                : `${pendingPostCount} postagens · ${total} postagens na sua fila`}
            </p>
          </div>
        </div>
        <a href={createPageUrl("Jobs")} className="flex items-center gap-1 text-xs font-semibold text-primary no-underline hover:underline">
          Abrir pauta <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      {total === 0 && !hasUpcomingPosts ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-muted-foreground">
          <CheckCircle2 className="h-9 w-9 text-emerald-500/60" />
          <p className="text-sm font-semibold text-foreground">Tudo em dia</p>
          <p className="text-xs">Nenhuma postagem pendente no período.</p>
        </div>
      ) : (
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <QueueSection title="Postagens atrasadas" count={queue.overdue.length} icon={AlertTriangle} tone="danger" items={queue.overdue} collaboratorsById={collaboratorsById} onJobClick={onJobClick} />
          <QueueSection title="Postagens hoje" count={queue.today.length} icon={Clock3} tone="warning" items={queue.today} collaboratorsById={collaboratorsById} onJobClick={onJobClick} progress={todayProgress} />
          {upcomingPosts && (
            <div className="lg:col-span-2">
              <NextPostsPanel {...upcomingPosts} onJobClick={onJobClick} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
