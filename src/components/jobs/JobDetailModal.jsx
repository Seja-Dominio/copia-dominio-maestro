import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X, Plus, CheckCircle2, Circle, Clock, AlertCircle,
  Calendar, Save, Trash2, Timer, Send, Paperclip,
  History, MessageSquare, ChevronRight, MoreVertical,
  Share2, CheckSquare, User, Play, Square, Copy, ChevronDown,
  RotateCcw, ChevronLeft, Check, GripVertical, Ban, Upload
} from "lucide-react";
import JobAttachmentsTab from "./JobAttachmentsTab";
import SendJobToWhatsAppModal from "./SendJobToWhatsAppModal";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import TimesheetEditModal from "@/components/timesheets/TimesheetEditModal";
import { format, differenceInSeconds, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useStatusConfig } from "@/lib/AppConfigContext";
import { autoCompleteSubtasks, deriveJobStatusFromSubtasks } from "./subtaskAutoComplete";
import { fireJobStatusNotifications } from "@/lib/jobNotifications";
import SpellCheckTextarea from "@/components/SpellCheckTextarea";
import { safeDelete } from "@/lib/safeDelete";
import LinkifiedText from "@/components/ui/LinkifiedText";
import { Link2 } from "lucide-react";

// STATUSES computed dynamically inside components via useStatusConfig()

const SUBTASK_STATUS_OPTIONS = [
  { value: "pending", label: "Pendente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "in_progress", label: "Fazendo", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "in_review", label: "Revisão", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "completed", label: "Feito", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "blocked", label: "Bloqueado", color: "bg-red-100 text-red-700 border-red-200" },
];

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}h:${String(m).padStart(2, "0")}m:${String(s).padStart(2, "0")}s`;
}

// Mini calendar table component
function CalendarPicker({ value, onChange, onClose }) {
  const [viewDate, setViewDate] = useState(() => value ? new Date(value + "T12:00:00") : new Date());
  const selected = value ? new Date(value + "T12:00:00") : null;

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // pad start (week starts Monday)
  const startPad = (getDay(monthStart) + 6) % 7;
  const padded = [...Array(startPad).fill(null), ...days];
  while (padded.length % 7 !== 0) padded.push(null);
  const weeks = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  return (
    <div className="p-3 w-[22rem]">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewDate(d => subMonths(d, 1))} className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold capitalize">{format(viewDate, "MMMM yyyy", { locale: ptBR })}</span>
        <button onClick={() => setViewDate(d => addMonths(d, 1))} className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <table className="w-full text-center text-[10px]">
        <thead>
          <tr>{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d => (
            <th key={d} className="py-1 font-bold text-muted-foreground">{d}</th>
          ))}</tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                if (!day) return <td key={di} />;
                const dayStr = format(day, "yyyy-MM-dd");
                const isSel = selected && isSameDay(day, selected);
                const isTod = isToday(day);
                return (
                  <td key={di} className="p-0.5">
                    <button
                      onClick={() => { onChange(dayStr); onClose(); }}
                      className={`w-7 h-7 rounded-full text-[10px] font-semibold transition-colors
                        ${isSel ? "bg-primary text-primary-foreground" : isTod ? "bg-accent text-accent-foreground" : "hover:bg-muted text-foreground"}`}
                    >
                      {format(day, "d")}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 pt-2 border-t border-border">
        <button onClick={() => { onChange(""); onClose(); }} className="text-xs text-muted-foreground hover:text-destructive font-semibold w-full text-center">
          Limpar data
        </button>
      </div>
    </div>
  );
}

// Add hours panel
function AddHoursPanel({ job, collaboratorId, collaboratorName, onClose, onSuccess, isRework = false }) {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveHours() {
    const h = parseInt(hours || 0);
    const m = parseInt(minutes || 0);
    if (h < 0 || m < 0 || (h === 0 && m === 0)) return;
    setSaving(true);
    try {
      await base44.entities.Timesheet.create({
        job_id: job.id, job_title: job.title,
        project_id: job.project_id, project_name: job.project_name,
        client_id: job.client_id, client_name: job.client_name,
        collaborator_id: collaboratorId,
        collaborator_name: collaboratorName,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_minutes: h * 60 + m,
        is_running: false, is_rework: isRework, status: "approved",
        notes: isRework ? `Retrabalho: ${h}h ${m}m` : `Apontado manualmente: ${h}h ${m}m`,
      });
      onSuccess?.();
    } finally { setSaving(false); }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-sm font-bold ${isRework ? "text-orange-600 flex items-center gap-2" : "text-foreground"}`}>
          {isRework && <RotateCcw className="w-4 h-4" />}
          {isRework ? "Registrar Retrabalho" : "Adicionar Apontamento"}
        </h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      {isRework && (
        <div className="text-xs bg-orange-50 dark:bg-orange-900/20 text-orange-700 border border-orange-200 rounded-lg px-3 py-2">
          O tempo de retrabalho conta como apontamento regular e será destacado nos relatórios.
        </div>
      )}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Horas</label>
          <input type="number" min="0" max="24" placeholder="0" className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={hours} onChange={e => setHours(e.target.value)} />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase">Minutos</label>
          <input type="number" min="0" max="59" placeholder="0" className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={minutes} onChange={e => setMinutes(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={onClose} variant="outline" size="sm" className="flex-1 h-8 text-xs">Cancelar</Button>
        <Button onClick={saveHours} disabled={saving || (!hours && !minutes)} size="sm" className="flex-1 h-8 text-xs">
          {saving ? "Salvando..." : "Apontar"}
        </Button>
      </div>
    </div>
  );
}

// Status dropdown
function StatusDropdown({ value, onChange }) {
  const { statusConfig: STATUS_CONFIG } = useStatusConfig();
  const STATUSES = Object.entries(STATUS_CONFIG).map(([v, cfg]) => ({ value: v, ...cfg }));
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const sc = STATUS_CONFIG[value] || STATUS_CONFIG.pending_briefing || {};

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${sc.color}`}>
        {sc.label}<ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-[65] bg-card border border-border rounded-xl shadow-xl overflow-hidden w-44">
          {STATUSES.map(s => (
            <button key={s.value} onClick={() => { onChange(s.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-muted transition-colors flex items-center gap-2 ${value === s.value ? "bg-muted/70" : ""}`}>
              <span className={`w-2 h-2 rounded-full ${s.dot || "bg-muted-foreground"}`} />{s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Post date with calendar table
function PostDateDropdown({ value, onChange, onRepeat }) {
  const [open, setOpen] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [repeatCount, setRepeatCount] = useState(1);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setShowRepeat(false); } }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted text-xs font-medium text-foreground hover:bg-accent transition-colors border border-border">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{value ? format(new Date(value + "T12:00:00"), "dd/MM/yyyy") : "Postagem"}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-[65] bg-card border border-border rounded-xl shadow-xl">
        <CalendarPicker value={value} onChange={onChange} onClose={() => setOpen(false)} />
          <div className="border-t border-border px-3 py-2">
            {!showRepeat ? (
              <button onClick={() => setShowRepeat(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Repetir este job
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5" /> Repetir job
                </p>
                <p className="text-[10px] text-muted-foreground">Quantas cópias criar?</p>
                <Input type="number" min={1} max={20} value={repeatCount} onChange={e => setRepeatCount(Number(e.target.value))} className="h-8 text-xs" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowRepeat(false)} className="flex-1 h-7 text-xs">Voltar</Button>
                  <Button size="sm" onClick={() => { onRepeat(repeatCount); setShowRepeat(false); setOpen(false); }} className="flex-1 h-7 text-xs">
                    Criar {repeatCount} {repeatCount === 1 ? "cópia" : "cópias"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Subtask row
function SubtaskRow({ subtask, collaborators, onUpdate, onDelete, dragHandleProps }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(subtask.title);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDeadlineCal, setShowDeadlineCal] = useState(false);
  const statusRef = useRef(null);
  const deadlineRef = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (statusRef.current && !statusRef.current.contains(e.target)) setShowStatusMenu(false); }
    if (showStatusMenu) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showStatusMenu]);

  useEffect(() => {
    function handleClick(e) { if (deadlineRef.current && !deadlineRef.current.contains(e.target)) setShowDeadlineCal(false); }
    if (showDeadlineCal) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDeadlineCal]);

  const statusOpt = SUBTASK_STATUS_OPTIONS.find(s => s.value === subtask.status) || SUBTASK_STATUS_OPTIONS[0];

  async function saveTitle() {
    if (title.trim() && title !== subtask.title) await onUpdate(subtask.id, { title: title.trim() });
    setEditingTitle(false);
  }

  return (
    <div className={`grid items-center gap-1.5 py-2 border-b border-border/50 group ${subtask.is_completed ? "opacity-60" : ""}`}
      style={{ gridTemplateColumns: "28px 32px 1fr 80px 90px 70px 22px" }}>

      {/* Drag handle */}
      <div {...dragHandleProps} className="flex items-center justify-center cursor-grab active:cursor-grabbing opacity-40 md:opacity-0 md:group-hover:opacity-100 transition-opacity w-7 h-10">
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>

      {/* Checkbox */}
      <button
        className="flex items-center justify-center w-8 h-10 rounded-lg hover:bg-muted/60 active:bg-muted transition-colors"
        onClick={() => onUpdate(subtask.id, {
          is_completed: !subtask.is_completed,
          status: !subtask.is_completed ? "completed" : "pending",
          completed_at: !subtask.is_completed ? new Date().toISOString() : null,
        })}
      >
        {subtask.is_completed
          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
          : <Circle className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />}
      </button>

      {/* Title */}
      {editingTitle ? (
        <input autoFocus className="text-xs bg-transparent border-b border-primary outline-none w-full"
          value={title} onChange={e => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitle(subtask.title); setEditingTitle(false); } }} />
      ) : (
        <span className={`text-xs font-medium cursor-text truncate ${subtask.is_completed ? "line-through text-muted-foreground" : "text-foreground"}`}
          onClick={() => setEditingTitle(true)}>{subtask.title}</span>
      )}

      {/* Status */}
      <div className="relative" ref={statusRef}>
        <button onClick={() => setShowStatusMenu(v => !v)}
          className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold w-full truncate ${statusOpt.color}`}>
          {statusOpt.label}
        </button>
        {showStatusMenu && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg overflow-hidden w-24">
            {SUBTASK_STATUS_OPTIONS.map(s => (
              <button key={s.value}
                onClick={() => { onUpdate(subtask.id, { status: s.value, is_completed: s.value === "completed", completed_at: s.value === "completed" ? new Date().toISOString() : null }); setShowStatusMenu(false); }}
                className={`w-full text-left px-2 py-1.5 text-[9px] font-semibold hover:bg-muted ${s.color.split(" ").slice(1).join(" ")}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Responsible */}
      <select className="h-8 rounded border border-input bg-background text-[10px] px-1 focus:outline-none w-full"
        style={{ WebkitAppearance: "menulist", appearance: "menulist" }}
        value={subtask.responsible_id || ""}
        onChange={e => {
          const collab = collaborators.find(c => c.id === e.target.value);
          onUpdate(subtask.id, { responsible_id: e.target.value, responsible_name: collab?.name || "" });
        }}>
        <option value="">Resp.</option>
        {subtask.responsible_id && !collaborators.some(c => c.id === subtask.responsible_id) && (
          <option value={subtask.responsible_id}>{subtask.responsible_name} (inativo)</option>
        )}
        {collaborators.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* Deadline — calendar */}
      <div className="relative" ref={deadlineRef}>
        <button onClick={() => setShowDeadlineCal(v => !v)}
          className="h-6 w-full rounded border border-input bg-background text-[9px] px-1 flex items-center gap-1 hover:bg-muted transition-colors">
          <Calendar className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{subtask.deadline ? format(new Date(subtask.deadline + "T12:00:00"), "dd/MM") : "Data"}</span>
        </button>
        {showDeadlineCal && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl">
            <CalendarPicker value={subtask.deadline} onChange={v => { onUpdate(subtask.id, { deadline: v }); setShowDeadlineCal(false); }} onClose={() => setShowDeadlineCal(false)} />
          </div>
        )}
      </div>

      {/* Delete */}
      <button onClick={() => onDelete(subtask.id)}
        className="w-5 h-5 rounded hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function JobDetailModal({ job: initialJob, subtasks: initialSubtasks, onClose, onUpdate, onSubtasksChange }) {
  const { statusConfig: STATUS_CONFIG, statusList } = useStatusConfig();
  const statusOrder = statusList.filter(s => s.key !== "cancelled").map(s => s.key);
  const [job, setJob] = useState(initialJob);
  // Ordenar subtasks por 'order' field
  const [subtasks, setSubtasks] = useState(() => {
    const subs = initialSubtasks || [];
    return [...subs].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  });

  // Auto-complete pending subtasks if job is already completed (retroactive fix)
  useEffect(() => {
    if (job.status === "completed" && subtasks.some(s => !s.is_completed)) {
      autoCompleteSubtasks("completed", subtasks, base44, statusOrder).then(updated => {
        setSubtasks(updated);
        onSubtasksChange?.();
      });
    }
  }, []);
  const [newSubtask, setNewSubtask] = useState("");
  const [newSubtaskStatus, setNewSubtaskStatus] = useState("pending");
  const [newSubtaskResponsible, setNewSubtaskResponsible] = useState("");
  const [newSubtaskDeadline, setNewSubtaskDeadline] = useState("");
  const [showNewSubtaskCal, setShowNewSubtaskCal] = useState(false);
  const newSubtaskCalRef = useRef(null);
  const saveTimerRef = useRef(null);
  const [tab, setTab] = useState(() => (initialJob.attachments?.length > 0) ? "attachments" : "comments");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploadingDrop, setIsUploadingDrop] = useState(false);
  const dragCounterRef = useRef(0);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [commentImages, setCommentImages] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [isReworkMode, setIsReworkMode] = useState(false);
  const [collaborators, setCollaborators] = useState([]);
  const [history, setHistory] = useState([]);
  const [repeating, setRepeating] = useState(false);
  const [legendaCopied, setLegendaCopied] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]); // quem está com timer rodando no job
  const timerRef = useRef(null);
  const imageInputRef = useRef(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, subtaskId: null, subtaskTitle: "" });
  const [cancelJobConfirm, setCancelJobConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [timesheetModal, setTimesheetModal] = useState(null); // null | {timesheet} | {newFor: job}

  // Get session collaborator (custom auth)
  const sessionCollaborator = (() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; }
  })();

  // The collaborator identity for timesheets
  const collabId = sessionCollaborator?.id || null;
  const collabName = sessionCollaborator?.name || "—";

  async function addHistory(type, text, extra = {}) {
    const entry = { time: new Date().toISOString(), type, text, user: collabName, ...extra };
    setHistory(prev => [entry, ...prev]);
    // Persist to DB
    await base44.entities.JobHistory.create({
      job_id: job.id,
      type,
      text,
      user: collabName,
      collaborator_id: collabId || undefined,
      ...extra,
    });
  }

  useEffect(() => {
    function handleClick(e) { if (newSubtaskCalRef.current && !newSubtaskCalRef.current.contains(e.target)) setShowNewSubtaskCal(false); }
    if (showNewSubtaskCal) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNewSubtaskCal]);

  useEffect(() => {
    async function init() {
      const [c, ts, col, hist] = await Promise.all([
        base44.entities.Comment.filter({ entity_id: job.id, entity_type: "job" }, "-created_date"),
        base44.entities.Timesheet.filter({ job_id: job.id }, "-created_date", 50),
        base44.entities.Collaborator.filter({ is_active: true }, "name", 100),
        base44.entities.JobHistory.filter({ job_id: job.id }, "-created_date", 100),
      ]);
      setComments(c);
      setTimesheets(ts);
      setCollaborators(col);

      // Load persisted history and add "opened" event
      const mappedHist = hist.map(h => ({ ...h, time: h.created_date }));
      setHistory(mappedHist);

      // Persist "opened" event
      const openedEntry = { time: new Date().toISOString(), type: "opened", text: `Aberto por ${collabName}`, user: collabName };
      setHistory(prev => [openedEntry, ...prev]);
      base44.entities.JobHistory.create({ job_id: job.id, type: "opened", text: `Aberto por ${collabName}`, user: collabName, collaborator_id: collabId || undefined });

      // Online users (others with timer running on this job)
      const online = ts.filter(t => t.is_running && t.collaborator_id !== collabId);
      setOnlineUsers(online.map(t => ({ id: t.collaborator_id, name: t.collaborator_name })));

      // Check running timer for THIS job (resume if already running)
      const runningHere = ts.find(t => t.is_running && t.collaborator_id === collabId);
      if (runningHere) {
        setActiveTimer(runningHere);
        setElapsed(Math.floor((Date.now() - new Date(runningHere.started_at).getTime()) / 1000));
      } else if (collabId) {
        // Auto-start: stop any other running timer and start one for this job
        const allRunning = await base44.entities.Timesheet.filter({ collaborator_id: collabId, is_running: true });
        const now = new Date().toISOString();
        await Promise.all(allRunning.map(t =>
          base44.entities.Timesheet.update(t.id, {
            is_running: false, ended_at: now,
            duration_minutes: Math.max(1, Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000)),
          })
        ));
        const newTs = await base44.entities.Timesheet.create({
          job_id: job.id, job_title: job.title,
          project_id: job.project_id, project_name: job.project_name,
          client_id: job.client_id, client_name: job.client_name,
          collaborator_id: collabId, collaborator_name: collabName,
          started_at: new Date().toISOString(), is_running: true, status: "pending", is_rework: false,
        });
        setActiveTimer(newTs);
        setElapsed(0);
      }
    }
    init();
  }, [job.id]);

  // Realtime: track who else is viewing this job (running timesheets)
  useEffect(() => {
    const unsub = base44.entities.Timesheet.subscribe(event => {
      if (event.data?.job_id !== job.id) return;
      base44.entities.Timesheet.filter({ job_id: job.id, is_running: true }, "-created_date", 20).then(running => {
        const others = running.filter(t => t.collaborator_id !== collabId);
        setOnlineUsers(others.map(t => ({ id: t.collaborator_id, name: t.collaborator_name })));
      });
    });
    return unsub;
  }, [job.id, collabId]);

  // Stop timer on unmount (navigation, page change, etc.)
  const activeTimerRef = useRef(null);
  activeTimerRef.current = activeTimer;

  useEffect(() => {
    return () => {
      // On unmount, stop any running timer using started_at from DB (not elapsed state)
      const t = activeTimerRef.current;
      if (t) {
        const dur = Math.max(1, Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000));
        base44.entities.Timesheet.update(t.id, {
          ended_at: new Date().toISOString(),
          is_running: false,
          duration_minutes: dur,
        });
      }
    };
  }, []);

  useEffect(() => {
    if (activeTimer) {
      // Calculate elapsed from started_at to avoid drift when tab is in background
      const calcElapsed = () => Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000);
      setElapsed(calcElapsed());
      timerRef.current = setInterval(() => setElapsed(calcElapsed()), 1000);

      // Recalculate when app returns from background (mobile tab switch, etc.)
      const handleVisibility = () => {
        if (document.visibilityState === "visible") setElapsed(calcElapsed());
      };
      document.addEventListener("visibilitychange", handleVisibility);
      return () => {
        clearInterval(timerRef.current);
        document.removeEventListener("visibilitychange", handleVisibility);
      };
    } else {
      clearInterval(timerRef.current);
      return () => clearInterval(timerRef.current);
    }
  }, [activeTimer?.id]);

  async function stopTimer() {
    if (!activeTimer) return;
    clearInterval(timerRef.current);
    // Always calculate from started_at (immune to browser throttling)
    const dur = Math.max(1, Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 60000));
    await base44.entities.Timesheet.update(activeTimer.id, { ended_at: new Date().toISOString(), is_running: false, duration_minutes: dur });
    setActiveTimer(null);
    setElapsed(0);
    const ts = await base44.entities.Timesheet.filter({ job_id: job.id }, "-created_date", 50);
    setTimesheets(ts);
    // Log session to history
    if (dur > 0) {
      const h = Math.floor(dur / 60);
      const m = dur % 60;
      const label = h > 0 ? `${h}h ${m}min` : `${m}min`;
      addHistory("timer_session", `Sessão de trabalho: ${label}${activeTimer.is_rework ? " (retrabalho)" : ""}`, { duration_minutes: dur });
    }
  }

  async function startTimer() {
    if (!collabId) return;
    // Parar qualquer timer anterior do colaborador
    const allRunning = await base44.entities.Timesheet.filter({ collaborator_id: collabId, is_running: true });
    const now = new Date().toISOString();
    await Promise.all(allRunning.map(t =>
      base44.entities.Timesheet.update(t.id, {
        is_running: false,
        ended_at: now,
        duration_minutes: Math.max(1, Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000)),
      })
    ));

    const ts = await base44.entities.Timesheet.create({
      job_id: job.id, job_title: job.title,
      project_id: job.project_id, project_name: job.project_name,
      client_id: job.client_id, client_name: job.client_name,
      collaborator_id: collabId, collaborator_name: collabName,
      started_at: new Date().toISOString(), is_running: true, status: "pending", is_rework: isReworkMode,
    });
    setActiveTimer(ts);
    setElapsed(0);
  }

  useEffect(() => {
    if (activeTimer) {
      base44.entities.Timesheet.update(activeTimer.id, { is_rework: isReworkMode });
      setActiveTimer(prev => ({ ...prev, is_rework: isReworkMode }));
    }
  }, [isReworkMode]);

  function update(key, value) {
    const oldValue = job[key];
    
    // For status and date changes, save immediately (no debounce)
    const immediateKeys = ["status", "post_date", "delivery_date", "responsible_id", "content_type", "reference_url"];
    const isImmediate = immediateKeys.includes(key);

    setJob(j => {
      const updated = { ...j, [key]: value };
      if (isImmediate) {
        // Save immediately — only send the changed field to avoid race conditions
        base44.entities.Job.update(j.id, { [key]: value }).then(saved => onUpdate(saved));
      } else {
        // Auto-save with debounce for text fields
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
          base44.entities.Job.update(j.id, { [key]: value }).then(saved => onUpdate(saved));
        }, 800);
      }
      return updated;
    });

    // Build descriptive history label
    let label;
    let newValueStr = String(value ?? "");
    let oldValueStr = String(oldValue ?? "");

    if (key === "status") {
      label = `Status: ${STATUS_CONFIG[oldValue]?.label || oldValue} → ${STATUS_CONFIG[value]?.label || value}`;
      oldValueStr = STATUS_CONFIG[oldValue]?.label || oldValue;
      newValueStr = STATUS_CONFIG[value]?.label || value;
    } else if (key === "post_date") {
      label = `Data de postagem → ${value ? format(new Date(value + "T12:00:00"), "dd/MM/yyyy") : "removida"}`;
    } else if (key === "delivery_date") {
      label = `Data de entrega → ${value ? format(new Date(value + "T12:00:00"), "dd/MM/yyyy") : "removida"}`;
    } else if (key === "title") {
      label = `Título alterado`;
    } else if (key === "briefing") {
      label = `Briefing atualizado`;
    } else if (key === "caption") {
      label = `Legenda atualizada`;
    } else if (key === "responsible_id") {
      const collab = collaborators.find(c => c.id === value);
      label = `Responsável → ${collab?.name || value}`;
      newValueStr = collab?.name || value;
    } else if (key === "is_favorite") {
      label = value ? "Marcado como favorito" : "Removido dos favoritos";
    } else {
      label = `Campo "${key}" alterado`;
    }

    addHistory("change", label, { field: key, old_value: oldValueStr, new_value: newValueStr });

    // For status changes, auto-complete subtasks and fire notifications
    if (key === "status") {
      autoCompleteSubtasks(value, subtasks, base44, statusOrder).then(updated => {
        setSubtasks(updated);
        onSubtasksChange?.();
      });
      fireJobStatusNotifications(
        { ...job, id: job.id },
        value,
        subtasks
      );
    }

    // When post_date changes, update subtask deadlines automatically
    if (key === "post_date" && oldValue !== value && value) {
      if (oldValue) {
        // Shift all subtask deadlines by the same offset
        const daysDiff = Math.round((new Date(value).getTime() - new Date(oldValue).getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff !== 0) {
          const updatedSubs = subtasks.map(s => {
            if (s.deadline) {
              const d = new Date(s.deadline + "T12:00:00");
              d.setDate(d.getDate() + daysDiff);
              return { ...s, deadline: d.toISOString().split('T')[0] };
            }
            return s;
          });
          const changed = updatedSubs.filter((s, i) => s.deadline !== subtasks[i].deadline);
          if (changed.length > 0) {
            Promise.all(changed.map(s => base44.entities.Subtask.update(s.id, { deadline: s.deadline }))).then(() => {
              setSubtasks(updatedSubs);
              onSubtasksChange?.();
            });
          }
        }
      } else {
        // No previous date — set deadlines for subtasks with days_before_post
        const updatedSubs = subtasks.map(s => {
          if (s.days_before_post && !s.deadline) {
            const d = new Date(value + "T12:00:00");
            d.setDate(d.getDate() - s.days_before_post);
            return { ...s, deadline: d.toISOString().split('T')[0] };
          }
          return s;
        });
        const changed = updatedSubs.filter((s, i) => s.deadline !== subtasks[i].deadline);
        if (changed.length > 0) {
          Promise.all(changed.map(s => base44.entities.Subtask.update(s.id, { deadline: s.deadline }))).then(() => {
            setSubtasks(updatedSubs);
            onSubtasksChange?.();
          });
        }
      }
    }
  }

  async function updateSubtask(subtaskId, data) {
    await base44.entities.Subtask.update(subtaskId, data);
    const updatedSubtasks = subtasks.map(s => s.id === subtaskId ? { ...s, ...data } : s);
    setSubtasks(updatedSubtasks);
    const sub = subtasks.find(s => s.id === subtaskId);
    // Build history label
    let label = `Tarefa "${sub?.title || subtaskId}" alterada`;
    if (data.status) label = `Tarefa "${sub?.title}" → status ${data.status}`;
    if (data.responsible_id) {
      const c = collaborators.find(c => c.id === data.responsible_id);
      label = `Tarefa "${sub?.title}" → responsável ${c?.name || data.responsible_id}`;
    }
    if (data.deadline) label = `Tarefa "${sub?.title}" → prazo ${data.deadline ? format(new Date(data.deadline + "T12:00:00"), "dd/MM/yyyy") : "removido"}`;
    addHistory("subtask", label);
    onSubtasksChange?.();

    // Derive job status from the UPDATED subtasks
    if (data.is_completed !== undefined || data.status) {
      const newJobStatus = deriveJobStatusFromSubtasks(job.status, updatedSubtasks, statusOrder);
      if (newJobStatus) {
        // Save job status directly (bypass debounce) and sync subtasks with the new status
        const oldStatus = job.status;
        const updatedJob = { ...job, status: newJobStatus };
        setJob(updatedJob);
        clearTimeout(saveTimerRef.current);
        const saved = await base44.entities.Job.update(job.id, updatedJob);
        onUpdate(saved);

        // Log status change
        const oldLabel = STATUS_CONFIG[oldStatus]?.label || oldStatus;
        const newLabel = STATUS_CONFIG[newJobStatus]?.label || newJobStatus;
        addHistory("change", `Status: ${oldLabel} → ${newLabel}`, { field: "status", old_value: oldLabel, new_value: newLabel });

        // Auto-complete/reopen other subtasks based on the new job status
        const synced = await autoCompleteSubtasks(newJobStatus, updatedSubtasks, base44, statusOrder);
        setSubtasks(synced);
        onSubtasksChange?.();

        fireJobStatusNotifications({ ...job, id: job.id }, newJobStatus, updatedSubtasks);
      }
    }
  }

  async function addSubtask() {
    if (!newSubtask.trim()) return;
    const collab = collaborators.find(c => c.id === newSubtaskResponsible);
    const created = await base44.entities.Subtask.create({
      job_id: job.id, title: newSubtask.trim(),
      status: newSubtaskStatus || "pending",
      responsible_id: newSubtaskResponsible || undefined,
      responsible_name: collab?.name || undefined,
      deadline: newSubtaskDeadline || undefined,
      order: subtasks.length,
    });
    setSubtasks(prev => [...prev, created]);
    addHistory("subtask_add", `Tarefa adicionada: "${newSubtask.trim()}"`);
    setNewSubtask("");
    setNewSubtaskStatus("pending");
    setNewSubtaskResponsible("");
    setNewSubtaskDeadline("");
    onSubtasksChange?.();
  }

  async function deleteSubtask(subtaskId) {
    const sub = subtasks.find(s => s.id === subtaskId);
    setDeleteConfirm({ isOpen: true, subtaskId, subtaskTitle: sub?.title || "" });
  }

  async function confirmDeleteSubtask() {
    setIsDeleting(true);
    try {
      const sub = subtasks.find(s => s.id === deleteConfirm.subtaskId);
      await safeDelete("subtask", "Subtask", sub || { id: deleteConfirm.subtaskId });
      setSubtasks(prev => prev.filter(s => s.id !== deleteConfirm.subtaskId));
      addHistory("subtask_del", `Tarefa removida: "${sub?.title || deleteConfirm.subtaskId}"`);
      onSubtasksChange?.();
    } finally {
      setIsDeleting(false);
      setDeleteConfirm({ isOpen: false, subtaskId: null, subtaskTitle: "" });
    }
  }

  async function postComment() {
    if (!newComment.trim() && commentImages.length === 0) return;
    let content = newComment.trim();
    if (commentImages.length > 0) content += commentImages.map(url => `\n![imagem](${url})`).join("");
    const created = await base44.entities.Comment.create({
      entity_type: "job", entity_id: job.id, entity_title: job.title,
      author_name: collabName, content,
    });
    setComments(prev => [created, ...prev]);
    setNewComment("");
    setCommentImages([]);
  }

  async function handleImageAttach(file) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (file_url) setCommentImages(prev => [...prev, file_url]);
    } catch (err) {
      console.error("Erro no upload de imagem:", err);
    }
  }

  function handleCommentPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) { const f = item.getAsFile(); if (f) handleImageAttach(f); }
    }
  }

  async function repeatJob(count) {
    setRepeating(true);
    const n = Math.max(1, Math.min(20, count));
    for (let i = 0; i < n; i++) {
      const newJob = await base44.entities.Job.create({
        title: job.title, project_id: job.project_id, project_name: job.project_name,
        client_id: job.client_id, client_name: job.client_name,
        responsible_id: job.responsible_id, responsible_name: job.responsible_name,
        content_type: job.content_type, status: "pending_briefing",
        briefing: job.briefing, estimated_hours: job.estimated_hours,
      });
      if (subtasks.length > 0) {
        await Promise.all(subtasks.map(s =>
          base44.entities.Subtask.create({
            job_id: newJob.id, title: s.title,
            responsible_id: s.responsible_id, responsible_name: s.responsible_name,
            status: "pending", order: s.order, complete_at_status: s.complete_at_status || "",
          })
        ));
      }
    }
    setRepeating(false);
    onSubtasksChange?.();
  }

  function copyLegenda() {
    if (job.caption) {
      navigator.clipboard.writeText(job.caption);
      setLegendaCopied(true);
      setTimeout(() => setLegendaCopied(false), 2000);
    }
  }

  // Global paste handler — paste images from clipboard to attachments from any tab
  useEffect(() => {
    function handlePaste(e) {
      // Don't intercept if user is typing in a text input/textarea (except comment paste which has its own handler)
      const tag = e.target.tagName;
      if (tag === "TEXTAREA") return;
      if (tag === "INPUT" && e.target.type !== "file") return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();

      (async () => {
        setIsUploadingDrop(true);
        const uploaded = [];
        for (const file of files) {
          if (file.size > 50 * 1024 * 1024) continue;
          try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            if (!file_url) continue;
            uploaded.push({
              name: file.name || `colagem-${Date.now()}.png`,
              url: file_url,
              size: file.size,
              type: file.type,
              uploaded_at: new Date().toISOString(),
            });
          } catch (err) {
            console.error("Erro no upload (paste):", file.name, err);
          }
        }
        setIsUploadingDrop(false);
        if (uploaded.length) {
          setJob(j => {
            const newAttachments = [...(j.attachments || []), ...uploaded];
            base44.entities.Job.update(j.id, { attachments: newAttachments }).then(saved => onUpdate(saved));
            uploaded.forEach(f => addHistory("attachment_add", `Anexo adicionado: "${f.name}"`));
            return { ...j, attachments: newAttachments };
          });
        }
      })();
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [job]);

  // Global drag-and-drop upload handler
  const handleGlobalDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes("Files")) setIsDraggingOver(true);
  }, []);
  const handleGlobalDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) { setIsDraggingOver(false); dragCounterRef.current = 0; }
  }, []);
  const handleGlobalDragOver = useCallback((e) => { e.preventDefault(); }, []);
  const handleGlobalDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    setIsUploadingDrop(true);
    const uploaded = [];
    for (const file of files) {
      if (file.size > 50 * 1024 * 1024) continue;
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (!file_url) continue;
        uploaded.push({
          name: file.name, url: file_url,
          size: file.size, type: file.type, uploaded_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Erro no upload (drop):", file.name, err);
      }
    }
    setIsUploadingDrop(false);
    if (uploaded.length) {
      setJob(j => {
        const newAttachments = [...(j.attachments || []), ...uploaded];
        base44.entities.Job.update(j.id, { attachments: newAttachments }).then(saved => onUpdate(saved));
        uploaded.forEach(f => addHistory("attachment_add", `Anexo adicionado: "${f.name}"`));
        return { ...j, attachments: newAttachments };
      });
    }
  }, []);

  const completedCount = subtasks.filter(s => s.is_completed).length;
  const openCount = subtasks.length - completedCount;
  const today = format(new Date(), "yyyy-MM-dd");
  const isLate = job.delivery_date && job.delivery_date < today && job.status !== "completed";
  const totalTimesheetMinutes = timesheets.filter(t => !t.is_running).reduce((sum, t) => sum + (t.duration_minutes || 0), 0);

  const historyIcons = {
    opened: "bg-blue-400",
    created: "bg-emerald-400",
    change: "bg-amber-400",
    subtask: "bg-purple-400",
    subtask_add: "bg-green-400",
    subtask_del: "bg-red-400",
    timer_session: "bg-cyan-400",
    comment: "bg-slate-400",
    attachment_add: "bg-green-400",
    attachment_del: "bg-red-400",
  };

  const historyTypeLabel = {
    opened: "👁️",
    created: "✨",
    change: "✏️",
    subtask: "☑️",
    subtask_add: "➕",
    subtask_del: "🗑️",
    timer_session: "⏱️",
    comment: "💬",
    attachment_add: "📎",
    attachment_del: "🗑️",
  };

  return createPortal(
    <>
    <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999, background: "rgba(0,0,0,0.5)" }} onClick={async () => { await stopTimer(); onClose(); }} />
    <div className="bg-card rounded-xl shadow-2xl flex flex-col overflow-visible"
      style={{position:"fixed", top: 60, left:"50%", transform:"translateX(-50%)", width:"calc(100% - 2rem)", maxWidth:"64rem", height:"calc(100vh - 70px)", maxHeight:"calc(100vh - 70px)", zIndex: 10000, borderRadius: 12}}
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      {/* Drop overlay */}
      {(isDraggingOver || isUploadingDrop) && (
        <div className="absolute inset-0 z-[100] bg-primary/10 border-4 border-dashed border-primary rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="bg-card rounded-2xl shadow-2xl px-8 py-6 text-center">
            {isUploadingDrop ? (
              <>
                <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm font-bold text-foreground">Enviando arquivo...</p>
              </>
            ) : (
              <>
                <Upload className="w-10 h-10 text-primary mx-auto mb-3" />
                <p className="text-sm font-bold text-foreground">Solte para anexar ao job</p>
                <p className="text-xs text-muted-foreground mt-1">Solte o arquivo para anexar</p>
              </>
            )}
          </div>
        </div>
      )}

        {/* TOP BAR */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-white dark:bg-card flex-shrink-0 flex-wrap">

          {/* Status */}
          <StatusDropdown value={job.status} onChange={v => update("status", v)} />

          {/* Post date with calendar */}
          <PostDateDropdown value={job.post_date} onChange={v => update("post_date", v)} onRepeat={repeatJob} />

          {/* Timer */}
          <div className="flex items-center gap-1.5">
            {activeTimer ? (
              <button onClick={stopTimer}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 text-xs font-bold border border-red-200 hover:bg-red-200 transition-colors">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {formatDuration(elapsed)}
                <Square className="w-3 h-3 ml-0.5" />
              </button>
            ) : (
              <button onClick={startTimer}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted text-muted-foreground text-xs font-semibold border border-border hover:bg-accent transition-colors">
                <Play className="w-3 h-3" /> Timer
              </button>
            )}
          </div>

          {/* Retrabalho toggle */}
          <button onClick={() => setIsReworkMode(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              isReworkMode ? "bg-orange-500 text-white border-orange-500" : "bg-orange-50 dark:bg-orange-900/20 text-orange-600 border-orange-200 hover:bg-orange-100"
            }`}>
            <RotateCcw className="w-3 h-3" /> Retrabalho
          </button>

          <div className="flex items-center gap-2 ml-auto">
            {/* Online users indicator */}
            {onlineUsers.length > 0 && (
              <div className="flex items-center gap-1" title={onlineUsers.map(u => u.name).join(", ") + " também está aqui"}>
                {onlineUsers.slice(0, 3).map(u => (
                  <div key={u.id} className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[9px] font-bold ring-2 ring-white dark:ring-card -ml-1 first:ml-0"
                    title={u.name}>
                    {u.name?.[0]?.toUpperCase()}
                  </div>
                ))}
                {onlineUsers.length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground ring-2 ring-white dark:ring-card -ml-1">
                    +{onlineUsers.length - 3}
                  </div>
                )}
                <span className="text-[10px] text-emerald-600 font-semibold ml-1">ao vivo</span>
              </div>
            )}
            {/* Cancel job button */}
            {job.status !== "cancelled" ? (
              <button
                onClick={() => setCancelJobConfirm(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200 transition-colors"
                title="Cancelar job"
              >
                <Ban className="w-3 h-3" /> Cancelar Job
              </button>
            ) : (
              <span className="text-xs font-semibold text-gray-400 px-2">Job Cancelado</span>
            )}
            <button onClick={async () => { await stopTimer(); onClose(); }}
              className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* JOB TITLE + BREADCRUMB */}
        <div className="px-6 py-0.5 border-b border-border bg-white dark:bg-card flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className="font-medium">{job.client_name}</span>
            <ChevronRight className="w-3 h-3" />
            <button
              onClick={async (e) => { e.stopPropagation(); await stopTimer(); onClose(); window.history.pushState(null, "", `/Projects?project=${job.project_id}`); window.location.href = `/Projects?project=${job.project_id}`; }}
              className="font-medium text-foreground hover:text-primary hover:underline transition-colors cursor-pointer"
            >{job.project_name}</button>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-muted-foreground hover:text-amber-400 transition-colors" onClick={() => update("is_favorite", !job.is_favorite)}>★</button>
            <input
              className="text-xl font-bold text-foreground bg-transparent border-none outline-none flex-1 focus:ring-0 p-0"
              value={job.title}
              onChange={e => update("title", e.target.value)}
            />
            {isLate && <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">ATRASADO</span>}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs font-mono text-muted-foreground">{job.number}</span>
            {job.demand_type === "interna" && (
              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 ml-1">Demanda Interna</span>
            )}
          </div>
        </div>

        {/* MAIN SPLIT */}
        <div className="flex flex-1 min-h-0 overflow-hidden rounded-b-2xl">

          {/* LEFT */}
          <div className="flex-1 overflow-y-auto border-r border-border">

            {/* Subtasks */}
            <div className="px-5 py-3 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground">Tarefas</span>
                <span className="text-xs text-muted-foreground">Abertas <span className="font-bold text-foreground">{openCount}/{subtasks.length}</span></span>
              </div>
              <div className="grid text-[9px] font-bold text-muted-foreground uppercase tracking-wide mb-1"
                style={{ gridTemplateColumns: "28px 32px 1fr 80px 90px 70px 22px" }}>
                <span /><span /><span>Tarefa</span><span>Status</span><span>Responsável</span><span>Prazo</span><span />
              </div>
            </div>

            <div className="px-5 py-2">
              <DragDropContext onDragEnd={async (result) => {
                if (!result.destination) return;
                const from = result.source.index;
                const to = result.destination.index;
                if (from === to) return;
                const reordered = Array.from(subtasks);
                const [moved] = reordered.splice(from, 1);
                reordered.splice(to, 0, moved);
                const updated = reordered.map((s, i) => ({ ...s, order: i }));
                setSubtasks(updated);
                await Promise.all(updated.map(s => base44.entities.Subtask.update(s.id, { order: s.order })));
                onSubtasksChange?.();
              }}>
                <Droppable droppableId="subtasks">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      {subtasks.map((s, index) => (
                        <Draggable key={s.id} draggableId={s.id} index={index}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.draggableProps}>
                              <SubtaskRow subtask={s} collaborators={collaborators} onUpdate={updateSubtask} onDelete={deleteSubtask} dragHandleProps={provided.dragHandleProps} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              {/* Add subtask */}
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => setNewSubtask(" ")}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar uma tarefa
                </button>
              </div>
              {newSubtask !== "" && (
                <div className="mt-2 p-3 border border-border rounded-xl bg-muted/30 space-y-2">
                  <Input autoFocus placeholder="Nome da tarefa..."
                    value={newSubtask.trim() === "" ? "" : newSubtask}
                    onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addSubtask(); if (e.key === "Escape") setNewSubtask(""); }}
                    className="h-8 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="h-9 rounded-lg border border-input bg-background text-xs px-2 focus:outline-none"
                      style={{ WebkitAppearance: "menulist", appearance: "menulist" }}
                      value={newSubtaskResponsible} onChange={e => setNewSubtaskResponsible(e.target.value)}>
                      <option value="">Responsável</option>
                      {collaborators.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {/* Deadline calendar for new subtask */}
                    <div className="relative" ref={newSubtaskCalRef}>
                      <button onClick={() => setShowNewSubtaskCal(v => !v)}
                        className="h-7 w-full rounded-lg border border-input bg-background text-xs px-2 flex items-center gap-1 hover:bg-muted">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <span>{newSubtaskDeadline ? format(new Date(newSubtaskDeadline + "T12:00:00"), "dd/MM/yy") : "Prazo"}</span>
                      </button>
                      {showNewSubtaskCal && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl">
                          <CalendarPicker value={newSubtaskDeadline} onChange={v => { setNewSubtaskDeadline(v); setShowNewSubtaskCal(false); }} onClose={() => setShowNewSubtaskCal(false)} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs flex-1"
                      onClick={() => { setNewSubtask(""); setNewSubtaskResponsible(""); setNewSubtaskDeadline(""); }}>
                      Cancelar
                    </Button>
                    <Button onClick={addSubtask} size="sm" className="h-7 text-xs flex-1">Adicionar</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Reference URL */}
            <div className="px-5 py-3 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-red-500" /> Referência
                  {job.reference_url && <div className="w-2 h-2 rounded-full bg-red-500" />}
                </span>
                {job.reference_url && (
                  <a href={job.reference_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline flex items-center gap-1">
                    🔗 Abrir link
                  </a>
                )}
              </div>
              <input
                type="url"
                placeholder="https://www.instagram.com/reel/..."
                value={job.reference_url || ""}
                onChange={e => update("reference_url", e.target.value)}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm text-red-600 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Briefing */}
            <div className="px-5 py-3 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground flex items-center gap-2">
                  Briefing {job.briefing && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                </span>
              </div>
              {editingBriefing ? (
                <SpellCheckTextarea
                  rows={12}
                  autoFocus
                  placeholder="Descreva o briefing do job..."
                  value={job.briefing || ""}
                  onChange={e => update("briefing", e.target.value)}
                  onBlur={() => setEditingBriefing(false)}
                />
              ) : (
                <div
                  onClick={() => setEditingBriefing(true)}
                  className="min-h-[120px] rounded-lg border border-input bg-background px-3 py-2 text-sm cursor-text whitespace-pre-wrap"
                >
                  {job.briefing ? (
                    <LinkifiedText text={job.briefing} className="text-sm text-foreground leading-relaxed" />
                  ) : (
                    <span className="text-muted-foreground">Descreva o briefing do job...</span>
                  )}
                </div>
              )}
            </div>

            {/* Legenda */}
            <div className="px-5 py-3 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-foreground">Legenda</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setShowWhatsApp(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors">
                    <MessageSquare className="w-3 h-3" /> WhatsApp
                  </button>
                <button onClick={copyLegenda}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    legendaCopied ? "bg-green-50 text-green-600 border-green-200" : "bg-muted text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                  }`}>
                  {legendaCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {legendaCopied ? "Copiado!" : "Copiar"}
                </button>
                </div>
              </div>
              {editingCaption ? (
                <SpellCheckTextarea
                  rows={6}
                  autoFocus
                  placeholder="Cole ou escreva a legenda do post..."
                  value={job.caption || ""}
                  onChange={e => update("caption", e.target.value)}
                  onBlur={() => setEditingCaption(false)}
                />
              ) : (
                <div
                  onClick={() => setEditingCaption(true)}
                  className="min-h-[80px] rounded-lg border border-input bg-background px-3 py-2 text-sm cursor-text whitespace-pre-wrap"
                >
                  {job.caption ? (
                    <LinkifiedText text={job.caption} className="text-sm text-foreground leading-relaxed" />
                  ) : (
                    <span className="text-muted-foreground">Cole ou escreva a legenda do post...</span>
                  )}
                </div>
              )}
            </div>


          </div>

          {/* RIGHT — Tabs */}
          <div className="w-80 flex flex-col overflow-hidden">
            <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
              {[
                { id: "comments", label: "Comentários", icon: MessageSquare },
                { id: "timesheet", label: "Timesheet", icon: Timer },
                { id: "attachments", label: "Anexos", icon: Paperclip },
                { id: "history", label: "Histórico", icon: History },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Comments */}
              {tab === "comments" && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 p-4 space-y-3">
                    {comments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-xs">Nenhum comentário ainda</div>
                    ) : comments.map(c => (
                      <div key={c.id} className="flex gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                          {c.author_name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-semibold text-foreground">{c.author_name || "Anônimo"}</span>
                            <span className="text-[10px] text-muted-foreground">{c.created_date ? format(new Date(c.created_date), "dd/MM HH:mm") : ""}</span>
                          </div>
                          {c.content?.includes("![imagem]") ? (
                            <div className="space-y-1">
                              {c.content.split("\n").map((line, li) => {
                                const m = line.match(/!\[imagem\]\((.+)\)/);
                                return m ? <img key={li} src={m[1]} alt="imagem" className="max-w-full rounded-lg border border-border mt-1" style={{ maxHeight: 160 }} />
                                  : line ? <p key={li} className="text-xs text-foreground leading-relaxed">{line}</p> : null;
                              })}
                            </div>
                          ) : <p className="text-xs text-foreground leading-relaxed">{c.content}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border p-3 flex-shrink-0 space-y-2">
                    {commentImages.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {commentImages.map((url, i) => (
                          <div key={i} className="relative group">
                            <img src={url} alt="" className="h-14 w-14 object-cover rounded-lg border border-border" />
                            <button onClick={() => setCommentImages(prev => prev.filter((_, idx) => idx !== i))}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Insira seu comentário aqui ou cole uma imagem"
                        value={newComment} onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && !e.shiftKey && postComment()}
                        onPaste={handleCommentPaste} />
                      <input ref={imageInputRef} type="file" accept="image/*" className="hidden"
                        onChange={e => { if (e.target.files[0]) handleImageAttach(e.target.files[0]); e.target.value = ""; }} />
                      <button onClick={postComment} className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center text-white hover:bg-primary/90">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Timesheet */}
              {tab === "timesheet" && (
                <div className="p-4 space-y-3">
                  <div className="bg-muted rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total registrado</p>
                    <p className="text-2xl font-black text-foreground">
                      {String(Math.floor(totalTimesheetMinutes / 60)).padStart(2, "0")}:{String(totalTimesheetMinutes % 60).padStart(2, "0")}h
                    </p>
                    {activeTimer && (
                      <p className="text-xs text-primary font-semibold mt-1 flex items-center justify-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Em andamento: {formatDuration(elapsed)}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setTimesheetModal({ job_id: job.id, job_title: job.title, project_id: job.project_id, project_name: job.project_name, client_id: job.client_id, client_name: job.client_name })}
                    className="w-full h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-3.5 h-3.5" /> Apontar Horas
                  </button>
                  <div className="space-y-2">
                    {timesheets.filter(t => !t.is_running).map(t => (
                      <div key={t.id}
                        onClick={() => setTimesheetModal(t)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${t.is_rework ? "bg-orange-50 dark:bg-orange-900/10 border-orange-200" : "bg-muted/50 border-border hover:bg-muted"}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-semibold text-foreground">{t.collaborator_name}</p>
                            {t.is_rework && (
                              <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <RotateCcw className="w-2.5 h-2.5" /> Retrabalho
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">{t.started_at ? format(new Date(t.started_at), "dd/MM HH:mm", { locale: ptBR }) : ""}</p>
                        </div>
                        <span className="text-xs font-bold text-foreground">
                          {String(Math.floor((t.duration_minutes || 0) / 60)).padStart(2, "0")}:{String((t.duration_minutes || 0) % 60).padStart(2, "0")}h
                        </span>
                      </div>
                    ))}
                    {timesheets.filter(t => !t.is_running).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">Nenhum registro ainda</p>
                    )}
                  </div>
                </div>
              )}

              {tab === "addHours" && (
                <AddHoursPanel job={job} collaboratorId={collabId} collaboratorName={collabName}
                  onClose={() => setTab("timesheet")} onSuccess={async () => {
                    const updated = await base44.entities.Timesheet.filter({ job_id: job.id }, "-created_date", 50);
                    setTimesheets(updated);
                    setTab("timesheet");
                  }} />
              )}

              {tab === "rework" && (
                <AddHoursPanel job={job} collaboratorId={collabId} collaboratorName={collabName} isRework
                  onClose={() => setTab("timesheet")} onSuccess={async () => {
                    const updated = await base44.entities.Timesheet.filter({ job_id: job.id }, "-created_date", 50);
                    setTimesheets(updated);
                    setTab("timesheet");
                  }} />
              )}

              {tab === "attachments" && (
                <div className="relative h-full flex flex-col">
                  <JobAttachmentsTab
                    currentUser={collabName}
                    isAdmin={sessionCollaborator?.access_level === "admin"}
                    uploadContext={{ clientName: job.client_name, projectName: job.project_name, jobTitle: job.title }}
                    attachments={job.attachments || []}
                    commentImages={comments.flatMap(c => {
                      const matches = [];
                      const regex = /!\[imagem\]\(([^)]+)\)/g;
                      let m;
                      while ((m = regex.exec(c.content || "")) !== null) matches.push(m[1]);
                      return matches;
                    })}
                    onAttachmentsChange={list => {
                      setJob(j => {
                        const oldList = j.attachments || [];
                        const added = list.filter(f => !oldList.some(o => o.url === f.url));
                        const removed = oldList.filter(f => !list.some(n => n.url === f.url));
                        added.forEach(f => addHistory("attachment_add", `Anexo adicionado: "${f.name}"`));
                        removed.forEach(f => addHistory("attachment_del", `Anexo removido: "${f.name}"`));
                        base44.entities.Job.update(j.id, { attachments: list }).then(saved => onUpdate(saved));
                        return { ...j, attachments: list };
                      });
                    }}
                    fullscreenLightbox
                  />
                </div>
              )}

              {/* History */}
              {tab === "history" && (
                <div className="p-3 space-y-0">
                  {history.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Sem histórico</p>
                  ) : history.map((h, i) => (
                    <div key={i} className="flex gap-2.5">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5 ${historyIcons[h.type] || "bg-muted-foreground"}`} />
                        {i < history.length - 1 && <div className="w-px flex-1 bg-border mt-1 mb-0" />}
                      </div>
                      <div className="pb-3 flex-1 min-w-0">
                        <div className="flex items-start gap-1">
                          <span className="text-[11px]">{historyTypeLabel[h.type] || "•"}</span>
                          <p className="text-xs font-semibold text-foreground leading-snug">{h.text}</p>
                        </div>
                        {/* old → new value for changes */}
                        {h.type === "change" && h.old_value && h.new_value && h.field !== "briefing" && h.field !== "caption" && h.field !== "title" && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] bg-red-50 dark:bg-red-900/20 text-red-600 px-1.5 py-0.5 rounded line-through">{h.old_value || "—"}</span>
                            <span className="text-[9px] text-muted-foreground">→</span>
                            <span className="text-[9px] bg-green-50 dark:bg-green-900/20 text-green-700 px-1.5 py-0.5 rounded font-semibold">{h.new_value || "—"}</span>
                          </div>
                        )}
                        {/* timer session duration badge */}
                        {h.type === "timer_session" && h.duration_minutes && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 px-1.5 py-0.5 rounded font-semibold mt-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {Math.floor(h.duration_minutes / 60)}h {h.duration_minutes % 60}min
                          </span>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {h.user} · {h.time ? format(new Date(h.time), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
        {timesheetModal && (
        <TimesheetEditModal
          timesheet={timesheetModal}
          collaborators={collaborators}
          isAdmin={sessionCollaborator?.access_level === "admin"}
          onClose={() => setTimesheetModal(null)}
          onSaved={async () => {
            const updated = await base44.entities.Timesheet.filter({ job_id: job.id }, "-created_date", 50);
            setTimesheets(updated);
          }}
          onDeleted={async () => {
            const updated = await base44.entities.Timesheet.filter({ job_id: job.id }, "-created_date", 50);
            setTimesheets(updated);
          }}
        />
      )}
      {showWhatsApp && <SendJobToWhatsAppModal job={job} onClose={() => setShowWhatsApp(false)} />}
      <ConfirmDeleteModal
        title="Excluir tarefa?"
        itemName={deleteConfirm.subtaskTitle}
        message="A tarefa será permanentemente removida do job."
        isOpen={deleteConfirm.isOpen}
        isLoading={isDeleting}
        onConfirm={confirmDeleteSubtask}
        onCancel={() => setDeleteConfirm({ isOpen: false, subtaskId: null, subtaskTitle: "" })}
      />
      <ConfirmDeleteModal
        title="Cancelar job?"
        itemName={job.title}
        itemSubtext=" será movido para cancelados."
        message="Você pode reverter alterando o status depois."
        confirmLabel="Cancelar Job"
        confirmLoadingLabel="Cancelando..."
        confirmVariant="warning"
        isOpen={cancelJobConfirm}
        onConfirm={async () => {
          setCancelJobConfirm(false);
          await stopTimer();
          // Save immediately (bypass debounce) so the job moves to Cancelled section
          const saved = await base44.entities.Job.update(job.id, { ...job, status: "cancelled" });
          setJob(j => ({ ...j, status: "cancelled" }));
          onUpdate(saved);
          addHistory("change", `Status: ${STATUS_CONFIG[job.status]?.label || job.status} → ${STATUS_CONFIG.cancelled?.label || "Cancelado"}`, { field: "status", old_value: STATUS_CONFIG[job.status]?.label || job.status, new_value: STATUS_CONFIG.cancelled?.label || "Cancelado" });
        }}
        onCancel={() => setCancelJobConfirm(false)}
      />
      </>,
      document.body
      );
      }