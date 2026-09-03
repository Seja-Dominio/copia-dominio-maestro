import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { X, Clock, ChevronDown, ChevronRight, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import TimesheetEditModal from "@/components/timesheets/TimesheetEditModal";

export default function ProjectTimesheetModal({ project, timesheets, jobs, collaborators, onClose, onRefresh }) {
  const [expanded, setExpanded] = useState({});
  const [editingTs, setEditingTs] = useState(null);
  const [newTsJob, setNewTsJob] = useState(null);

  // Group timesheets by job_id
  const tsByJob = timesheets.filter(t => !t.is_running).reduce((acc, t) => {
    const key = t.job_id || "__no_job__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  // Jobs sorted by post_date, include jobs with timesheets even if not in jobs list
  const jobIds = [...new Set([
    ...jobs.map(j => j.id),
    ...timesheets.map(t => t.job_id).filter(Boolean),
  ])];

  const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]));

  const totalMinutes = timesheets.filter(t => !t.is_running).reduce((s, t) => s + (t.duration_minutes || 0), 0);

  function fmtMin(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  }

  function toggleJob(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">Horas por Job — {project.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">Total: <span className="font-semibold text-foreground">{fmtMin(totalMinutes)}</span></p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {jobIds.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-10">Nenhum apontamento registrado</p>
          )}
          {jobIds.map(jobId => {
            const job = jobMap[jobId];
            const entries = tsByJob[jobId] || [];
            const jobMinutes = entries.reduce((s, t) => s + (t.duration_minutes || 0), 0);
            const isOpen = expanded[jobId];
            const jobTitle = job?.title || entries[0]?.job_title || "Job sem título";

            return (
              <div key={jobId} className="rounded-xl border border-border bg-background overflow-hidden">
                {/* Job row */}
                <button
                  onClick={() => toggleJob(jobId)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                  <div className="flex-1 min-w-0 truncate">
                    <span className="text-sm font-semibold text-foreground">{jobTitle}</span>
                    {job?.number && <span className="ml-2 text-[10px] font-mono text-muted-foreground">#{job.number}</span>}
                  </div>
                  <span className="text-xs font-bold text-primary whitespace-nowrap flex-shrink-0">{fmtMin(jobMinutes)}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 whitespace-nowrap flex-shrink-0">{entries.length} apont.</span>
                  {job && (
                    <button
                      onClick={e => { e.stopPropagation(); setNewTsJob(job); }}
                      className="ml-2 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                      title="Novo apontamento"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </button>

                {/* Timesheet entries */}
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {entries.length === 0 && (
                      <p className="text-xs text-muted-foreground px-4 py-3">Nenhum apontamento</p>
                    )}
                    {entries.sort((a, b) => (a.started_at || "").localeCompare(b.started_at || "")).map(ts => (
                      <div key={ts.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 group/ts">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[9px] font-bold flex-shrink-0">
                          {ts.collaborator_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-foreground">{ts.collaborator_name || "—"}</span>
                          {ts.started_at && (
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {format(new Date(ts.started_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                            </span>
                          )}
                          {ts.is_rework && <span className="ml-2 text-[10px] text-orange-500 font-semibold">Retrabalho</span>}
                          {ts.notes && <p className="text-[10px] text-muted-foreground truncate">{ts.notes}</p>}
                        </div>
                        <span className="text-xs font-bold text-foreground whitespace-nowrap">{fmtMin(ts.duration_minutes || 0)}</span>
                        <button
                          onClick={() => setEditingTs(ts)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg opacity-0 group-hover/ts:opacity-100 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editingTs && (
        <TimesheetEditModal
          timesheet={editingTs}
          collaborators={collaborators}
          isAdmin={true}
          onClose={() => setEditingTs(null)}
          onSaved={() => { setEditingTs(null); onRefresh?.(); }}
          onDeleted={() => { setEditingTs(null); onRefresh?.(); }}
        />
      )}

      {newTsJob && (
        <TimesheetEditModal
          timesheet={{
            job_id: newTsJob.id,
            job_title: newTsJob.title,
            project_id: project.id,
            project_name: project.name,
            client_id: project.client_id,
            client_name: project.client_name,
          }}
          collaborators={collaborators}
          isAdmin={true}
          onClose={() => setNewTsJob(null)}
          onSaved={() => { setNewTsJob(null); onRefresh?.(); }}
          onDeleted={() => setNewTsJob(null)}
        />
      )}
    </div>,
    document.body
  );
}