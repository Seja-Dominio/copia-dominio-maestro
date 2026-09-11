import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ListTodo } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isClosedJob, isOpenSubtask } from "@/lib/jobWorkflow";
import { useStatusConfig } from "@/lib/AppConfigContext";
import { createPageUrl } from "@/utils";
import NextPostsPanel from "@/components/dashboard/NextPostsPanel";

const MAX_VISIBLE = 4;

function formatDeadline(date) {
  if (!date) return "Sem prazo";
  return format(parseISO(date), "dd/MM", { locale: ptBR });
}

function QueueItem({ item, tone, statusLabel, responsibleName, onJobClick }) {
  const toneClasses = {
    danger: "border-red-200 bg-red-50/60 hover:bg-red-100/70 dark:border-red-900 dark:bg-red-950/20",
    warning: "border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 dark:border-amber-900 dark:bg-amber-950/20",
  };
  return (
    <button
      type="button"
      onClick={() => onJobClick?.(item.job)}
      className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${toneClasses[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-foreground">{statusLabel}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {item.job.client_name || "Sem cliente"} · {item.job.title} · {responsibleName || "Sem responsável"}
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        {item.subtask.deadline ? formatDeadline(item.subtask.deadline) : "—"}
        <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  );
}

function QueueSection({ title, count, icon: Icon, tone, items, statusConfig, collaboratorsById, onJobClick }) {
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
      <div className="space-y-1.5">
        {visible.map(item => (
          <QueueItem
            key={item.subtask.id}
            item={item}
            tone={tone}
            statusLabel={statusConfig[item.job.status]?.label || item.job.status || "Sem status"}
            responsibleName={item.subtask.responsible_name || collaboratorsById.get(item.subtask.responsible_id)?.name}
            onJobClick={onJobClick}
          />
        ))}
      </div>
      {items.length > MAX_VISIBLE && (
        <button type="button" onClick={() => setExpanded(value => !value)} className="text-[11px] font-semibold text-primary hover:underline">
          {expanded ? "Mostrar menos" : `Ver mais ${items.length - MAX_VISIBLE}`}
        </button>
      )}
    </div>
  );
}

export default function MyWorkQueue({ subtasks, jobs, collaborators = [], todayStr, upcomingPosts, onJobClick }) {
  const { statusConfig } = useStatusConfig();
  const jobMap = useMemo(() => new Map(jobs.map(job => [job.id, job])), [jobs]);
  const collaboratorsById = useMemo(() => new Map(collaborators.map(collaborator => [collaborator.id, collaborator])), [collaborators]);
  const queue = useMemo(() => {
    const items = subtasks
      .map(subtask => ({ subtask, job: jobMap.get(subtask.job_id) }))
      .filter(item => item.job && !isClosedJob(item.job))
      .filter(item => isOpenSubtask(item.subtask));

    return {
      overdue: items.filter(item => item.subtask.deadline && item.subtask.deadline < todayStr),
      today: items.filter(item => item.subtask.deadline === todayStr),
    };
  }, [subtasks, jobMap, todayStr]);

  const total = queue.overdue.length + queue.today.length;
  const hasUpcomingPosts = upcomingPosts?.dayGroups?.length > 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Minha fila de trabalho</h3>
            <p className="text-xs text-muted-foreground">O que precisa da sua ação agora</p>
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
          <p className="text-xs">Nenhuma tarefa pendente no período.</p>
        </div>
      ) : (
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <QueueSection title="Atrasadas" count={queue.overdue.length} icon={AlertTriangle} tone="danger" items={queue.overdue} statusConfig={statusConfig} collaboratorsById={collaboratorsById} onJobClick={onJobClick} />
          <QueueSection title="Vence hoje" count={queue.today.length} icon={Clock3} tone="warning" items={queue.today} statusConfig={statusConfig} collaboratorsById={collaboratorsById} onJobClick={onJobClick} />
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
