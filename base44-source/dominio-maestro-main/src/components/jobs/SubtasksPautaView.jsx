import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Circle, Clock, AlertCircle, Users, User, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUBTASK_STATUS = {
  pending: { label: "Pendente", color: "bg-slate-100 text-slate-600 border-slate-200" },
  in_progress: { label: "Em andamento", color: "bg-blue-100 text-blue-700 border-blue-200" },
  in_review: { label: "Em revisão", color: "bg-purple-100 text-purple-700 border-purple-200" },
  completed: { label: "Concluída", color: "bg-green-100 text-green-700 border-green-200" },
  blocked: { label: "Bloqueada", color: "bg-red-100 text-red-700 border-red-200" },
};

export default function SubtasksPautaView({ subtasks, jobs, collabId, isAdmin, onSelectJob, onSubtaskComplete }) {
  const [completingId, setCompletingId] = useState(null);

  const handleComplete = async (e, subtaskId) => {
    e.stopPropagation();
    if (!onSubtaskComplete) return;
    setCompletingId(subtaskId);
    await onSubtaskComplete(subtaskId);
    setCompletingId(null);
  };
  const [showAll, setShowAll] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  // Map jobs by id for quick lookup
  const jobsMap = useMemo(() => {
    const m = {};
    jobs.forEach(j => { m[j.id] = j; });
    return m;
  }, [jobs]);

  // Filter subtasks: only non-completed, non-blocked, belonging to active jobs
  const pautaItems = useMemo(() => {
    return subtasks
      .filter(s => {
        if (s.is_completed || s.status === "completed" || s.status === "blocked") return false;
        const job = jobsMap[s.job_id];
        if (!job || job.status === "completed" || job.status === "cancelled") return false;
        // "Minhas Pautas" mode: only show subtasks assigned to the current user
        // "Todos" mode (admin only): show all subtasks
        if (isAdmin && showAll) return true;
        return s.responsible_id === collabId;
      })
      .map(s => ({ ...s, _job: jobsMap[s.job_id] }))
      .sort((a, b) => {
        const da = a.deadline || a._job?.post_date || "9999-99-99";
        const db = b.deadline || b._job?.post_date || "9999-99-99";
        return da.localeCompare(db);
      });
  }, [subtasks, jobsMap, collabId, isAdmin, showAll]);

  const isLate = (dateStr) => dateStr && dateStr <= today;

  return (
    <div className="p-4 md:p-6 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setShowAll(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  !showAll ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="w-3.5 h-3.5" /> Minhas Pautas
              </button>
              <button
                onClick={() => setShowAll(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  showAll ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="w-3.5 h-3.5" /> Pautas da Equipe
              </button>
            </div>
          ) : (
            <h3 className="text-sm font-bold text-foreground">Minhas Pautas</h3>
          )}
          <span className="text-sm text-muted-foreground font-normal">({pautaItems.length})</span>
        </div>
      </div>

      {/* Table */}
      {pautaItems.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma tarefa pendente</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Tarefa</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Projeto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Job</th>
                  {showAll && isAdmin && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Responsável</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Prazo</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {pautaItems.map(s => {
                  const job = s._job;
                  const deadline = s.deadline || job?.post_date;
                  const late = isLate(deadline);
                  const st = SUBTASK_STATUS[s.status] || SUBTASK_STATUS.pending;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => job && onSelectJob(job)}
                      className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground max-w-[240px] truncate">{s.title}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{job?.project_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[180px] truncate">{job?.title || "—"}</td>
                      {showAll && isAdmin && (
                        <td className="px-4 py-3">
                          {s.responsible_name ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[9px] font-bold">
                                {s.responsible_name[0]?.toUpperCase()}
                              </div>
                              <span className="text-xs text-muted-foreground">{s.responsible_name}</span>
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium ${late ? "text-destructive" : "text-muted-foreground"}`}>
                        {deadline ? format(new Date(deadline + "T12:00:00"), "dd/MM/yyyy") : "—"}
                        {late && <AlertCircle className="w-3 h-3 inline ml-1" />}
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          disabled={completingId === s.id}
                          onClick={(e) => handleComplete(e, s.id)}
                          title="Concluir tarefa"
                        >
                          {completingId === s.id ? (
                            <Circle className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {pautaItems.map(s => {
              const job = s._job;
              const deadline = s.deadline || job?.post_date;
              const late = isLate(deadline);
              const st = SUBTASK_STATUS[s.status] || SUBTASK_STATUS.pending;
              return (
                <div
                  key={s.id}
                  onClick={() => job && onSelectJob(job)}
                  className="p-3 active:bg-muted/50 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{s.title}</p>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                        <span className="truncate">{job?.project_name}</span>
                        <ChevronRight className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{job?.title}</span>
                      </div>
                      {showAll && isAdmin && s.responsible_name && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">👤 {s.responsible_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold border ${st.color}`}>
                          {st.label}
                        </span>
                        <span className={`text-[10px] font-medium ${late ? "text-destructive" : "text-muted-foreground"}`}>
                          {deadline ? format(new Date(deadline + "T12:00:00"), "dd/MM") : "—"}
                          {late && " ⚠️"}
                        </span>
                      </div>
                      <button
                        className="w-7 h-7 flex items-center justify-center rounded-full text-green-600 hover:bg-green-50 transition-colors"
                        disabled={completingId === s.id}
                        onClick={(e) => handleComplete(e, s.id)}
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}