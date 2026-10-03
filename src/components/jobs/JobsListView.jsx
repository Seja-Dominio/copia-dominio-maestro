import { useStatusConfig } from "@/lib/AppConfigContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle } from "lucide-react";
import { isJobOverdue, isSubtaskOverdue, normalizeWorkflowStatus } from "@/lib/jobWorkflow";

function getListCardTone(job, subtasks, today) {
  const status = normalizeWorkflowStatus(job.status);
  if (["completed", "scheduled"].includes(status)) return { key: "done", className: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/85 to-emerald-100/70 dark:border-emerald-800/70 dark:from-emerald-950/40 dark:via-emerald-950/30 dark:to-emerald-900/50" };
  if (isJobOverdue(job, today, "post_date")) return { key: "post-overdue", className: "border-red-200 bg-gradient-to-br from-red-50 via-red-50/85 to-red-100/70 dark:border-red-800/70 dark:from-red-950/40 dark:via-red-950/30 dark:to-red-900/50" };
  if (subtasks.some(subtask => isSubtaskOverdue(subtask, today))) return { key: "task-overdue", className: "border-amber-200 bg-gradient-to-br from-amber-50 via-amber-50/85 to-amber-100/70 dark:border-amber-800/70 dark:from-amber-950/40 dark:via-amber-950/30 dark:to-amber-900/50" };
  return { key: "on-time", className: "border-border bg-card" };
}

export default function JobsListView({ jobs, getSubtasksForJob, onSelectJob, today }) {
  const { statusConfig: STATUS_CONFIG } = useStatusConfig();

  const collaborator = JSON.parse(sessionStorage.getItem("collaborator") || "{}");
  const collabId = collaborator?.id;

  // Minha pauta: jobs onde o colaborador está envolvido ou é responsável
  const myJobs = jobs.filter(j =>
    j.responsible_id === collabId ||
    (j.involved || []).includes(collabId)
  );

  // Separar cancelados para o fim
  const active = myJobs.filter(j => j.status !== "cancelled");
  const cancelled = myJobs.filter(j => j.status === "cancelled");
  const sorted = [...active, ...cancelled];

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-20">
        <p className="text-sm">Nenhum job na sua pauta</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {sorted.map(j => {
        const sc = STATUS_CONFIG[j.status] || STATUS_CONFIG.pending_briefing;
        const subtasks = getSubtasksForJob(j.id);
        const openSubtasks = subtasks.filter(s => !s.is_completed).length;
        const isLate = isJobOverdue(j, today, "post_date");
        const tone = getListCardTone(j, subtasks, today);

        return (
          <div
            key={j.id}
            data-status-tone={tone.key}
            onClick={() => onSelectJob(j)}
            className={`border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all flex items-center gap-3 ${tone.className} ${
              j.status === "cancelled" ? "opacity-50" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`status-badge ${sc.color} border text-[10px]`}>{sc.label}</span>
                {isLate && <AlertCircle className="w-3 h-3 text-destructive flex-shrink-0" />}
              </div>
              <p className="text-sm font-semibold text-foreground truncate">{j.title}</p>
              <p className="text-xs text-muted-foreground">{j.client_name || j.project_name || "—"}</p>
            </div>
            <div className="text-right flex-shrink-0 space-y-0.5">
              {j.post_date && (
                <p className="text-[10px] text-muted-foreground">
                  {format(new Date(j.post_date + "T12:00:00"), "dd/MM/yy", { locale: ptBR })}
                </p>
              )}
              {subtasks.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {openSubtasks}/{subtasks.length} tarefas
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
