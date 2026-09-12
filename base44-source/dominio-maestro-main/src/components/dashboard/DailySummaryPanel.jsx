import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { todayStr as getTodayStr } from "@/lib/dateUtils";
import {
  CalendarDays, ChevronDown, ChevronUp, Download, User,
  Briefcase, Clock, ArrowRightLeft, FileText, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import DailySummaryCollaboratorRow from "./DailySummaryCollaboratorRow";
import { generateDailyPDF } from "@/lib/dailyReportExport";

// Natural status flow order
const STATUS_ORDER = [
  "pending_briefing", "pending_capture", "pending_design",
  "pending_edit", "internal_approval", "client_approval",
  "scheduled", "completed"
];

function isRetrograde(oldStatus, newStatus) {
  if (!oldStatus || !newStatus || newStatus === "cancelled") return false;
  const oldIdx = STATUS_ORDER.indexOf(oldStatus);
  const newIdx = STATUS_ORDER.indexOf(newStatus);
  if (oldIdx === -1 || newIdx === -1) return false;
  return newIdx < oldIdx;
}

export default function DailySummaryPanel({ jobs, timesheets, collaborators, subtasks, projects }) {
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [userFilter, setUserFilter] = useState("all");
  const [expanded, setExpanded] = useState(true);
  const [jobHistories, setJobHistories] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    base44.entities.JobHistory.filter({}, "-created_date", 5000).then(h => {
      setJobHistories(h.filter(e => e.created_date?.startsWith(selectedDate)));
    });
  }, [selectedDate]);

  // Jobs created on date
  const jobsOnDate = useMemo(() =>
    jobs.filter(j => j.created_date?.startsWith(selectedDate)),
  [jobs, selectedDate]);

  // Timesheets on date
  const tsOnDate = useMemo(() =>
    timesheets.filter(t => !t.is_running && t.started_at?.startsWith(selectedDate)),
  [timesheets, selectedDate]);

  // Projects created on date
  const projectsCreatedOnDate = useMemo(() =>
    projects.filter(p => p.created_date?.startsWith(selectedDate)),
  [projects, selectedDate]);

  // Projects archived on date (status changed to archived)
  const projectsArchivedOnDate = useMemo(() =>
    projects.filter(p => p.status === "archived" && p.updated_date?.startsWith(selectedDate)),
  [projects, selectedDate]);

  // Categorize job histories
  const categorized = useMemo(() => {
    const statusChanges = [];
    const retrogradeChanges = [];
    const briefingEdits = [];
    const captionEdits = [];
    const attachmentAdds = [];
    const scheduleChanges = []; // post_date changes = cronograma
    const otherActions = [];

    jobHistories.forEach(h => {
      if (h.type === "change" && h.field === "status") {
        if (isRetrograde(h.old_value, h.new_value)) {
          retrogradeChanges.push(h);
        }
        statusChanges.push(h);
      } else if (h.type === "change" && h.field === "briefing") {
        briefingEdits.push(h);
      } else if (h.type === "change" && h.field === "caption") {
        captionEdits.push(h);
      } else if (h.type === "change" && h.field === "post_date") {
        scheduleChanges.push(h);
      } else if (h.type === "attachment_add" || h.type === "attachment_del") {
        attachmentAdds.push(h);
      } else if (h.type === "opened" || h.type === "comment" || h.type === "subtask_add" || h.type === "subtask_del") {
        otherActions.push(h);
      }
    });

    return { statusChanges, retrogradeChanges, briefingEdits, captionEdits, attachmentAdds, scheduleChanges, otherActions };
  }, [jobHistories]);

  const collabSummaries = useMemo(() => {
    const activeCollabs = collaborators.filter(c => c.is_active);
    return activeCollabs.map(collab => {
      const created = jobsOnDate.filter(j => j.responsible_id === collab.id || j.created_by === collab.email);
      const ts = tsOnDate.filter(t => t.collaborator_id === collab.id);
      const totalMinutes = ts.reduce((s, t) => s + (t.duration_minutes || 0), 0);
      const changes = categorized.statusChanges.filter(h => h.collaborator_id === collab.id);
      const retrogrades = categorized.retrogradeChanges.filter(h => h.collaborator_id === collab.id);
      const briefings = categorized.briefingEdits.filter(h => h.collaborator_id === collab.id);
      const captions = categorized.captionEdits.filter(h => h.collaborator_id === collab.id);
      const attachments = categorized.attachmentAdds.filter(h => h.collaborator_id === collab.id);
      const schedules = categorized.scheduleChanges.filter(h => h.collaborator_id === collab.id);
      const others = categorized.otherActions.filter(h => h.collaborator_id === collab.id);
      const projCreated = projectsCreatedOnDate.filter(p => p.responsible_id === collab.id || p.created_by === collab.email);
      const projArchived = projectsArchivedOnDate.filter(p => p.responsible_id === collab.id);
      const clientNames = [...new Set(ts.map(t => t.client_name).filter(Boolean))];

      const totalActions = created.length + ts.length + changes.length + briefings.length + captions.length + attachments.length + schedules.length + others.length + projCreated.length + projArchived.length;
      const hasActivity = totalActions > 0;

      return {
        collaborator: collab, jobsCreated: created, timesheets: ts, totalMinutes,
        statusChanges: changes, retrogradeChanges: retrogrades,
        briefingEdits: briefings, captionEdits: captions,
        attachmentActions: attachments, scheduleChanges: schedules,
        otherActions: others, projectsCreated: projCreated, projectsArchived: projArchived,
        clientNames, hasActivity, totalActions
      };
    }).filter(s => s.hasActivity).sort((a, b) => b.totalActions - a.totalActions);
  }, [collaborators, jobsOnDate, tsOnDate, categorized, projectsCreatedOnDate, projectsArchivedOnDate]);

  const filteredSummaries = useMemo(() => {
    if (userFilter === "all") return collabSummaries;
    return collabSummaries.filter(s => s.collaborator.id === userFilter);
  }, [collabSummaries, userFilter]);

  const totalStatusChanges = filteredSummaries.reduce((s, c) => s + c.statusChanges.length, 0);
  const totalMinutes = filteredSummaries.reduce((s, c) => s + c.totalMinutes, 0);
  const totalActions = filteredSummaries.reduce((s, c) => s + c.totalActions, 0);
  const totalRetrogrades = filteredSummaries.reduce((s, c) => s + c.retrogradeChanges.length, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const activeCollabs = useMemo(() =>
    collaborators.filter(c => c.is_active).sort((a, b) => a.name.localeCompare(b.name)),
  [collaborators]);

  async function handleDownloadPDF(mode) {
    setExporting(true);
    try {
      const data = mode === "all" ? collabSummaries : filteredSummaries;
      const label = mode === "all" ? "Geral" : filteredSummaries[0]?.collaborator?.name || "usuario";
      generateDailyPDF(data, selectedDate, label);
    } finally {
      setExporting(false);
    }
  }

  const selectedUserName = userFilter !== "all" ? activeCollabs.find(c => c.id === userFilter)?.name : null;

  return (
    <div className="glass-card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <CalendarDays className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Resumo Diário</h3>
            <p className="text-[11px] text-muted-foreground capitalize">
              {format(new Date(selectedDate + "T12:00:00"), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground mr-2">
            <span className="flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" />{totalStatusChanges} etapas</span>
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{totalActions} ações</span>
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{totalHours}h</span>
            {totalRetrogrades > 0 && (
              <span className="flex items-center gap-1 text-destructive font-semibold">⚠ {totalRetrogrades} retrógradas</span>
            )}
          </div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-muted/20">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={selectedDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={e => e.target.value && setSelectedDate(e.target.value)}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <User className="w-3.5 h-3.5 text-muted-foreground ml-1" />
              <select
                className="h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={userFilter}
                onChange={e => setUserFilter(e.target.value)}
              >
                <option value="all">Todos os colaboradores</option>
                {activeCollabs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              {userFilter !== "all" && filteredSummaries.length > 0 && (
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => handleDownloadPDF("user")} disabled={exporting}>
                  <Download className="w-3 h-3" /> {selectedUserName?.split(" ")[0]} (.pdf)
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => handleDownloadPDF("all")} disabled={exporting}>
                <Download className="w-3 h-3" /> Geral (.pdf)
              </Button>
            </div>
          </div>

          <div className="divide-y divide-border">
            {filteredSummaries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma atividade registrada neste dia
              </div>
            ) : (
              filteredSummaries.map(summary => (
                <DailySummaryCollaboratorRow key={summary.collaborator.id} summary={summary} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}