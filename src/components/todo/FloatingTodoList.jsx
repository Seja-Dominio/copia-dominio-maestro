import { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ListTodo, X, Plus, Search, Loader2, History, ArrowLeft, Check, Users, FileText
} from "lucide-react";
import TodoItem from "./TodoItem";
import TodoCompletedGroup from "./TodoCompletedGroup";
import { safeDelete } from "@/lib/safeDelete";
import SendTaskForm from "./SendTaskForm";
import TeamTasksTab from "./TeamTasksTab";
import NotesTab from "./NotesTab";

export default function FloatingTodoList() {
  const [open, setOpen] = useState(() => sessionStorage.getItem("todoListOpen") === "true");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState("tasks"); // "tasks" | "history" | "team" | "notes"
  const [expandedDay, setExpandedDay] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchFocused, setHistorySearchFocused] = useState(false);
  const inputRef = useRef(null);

  const collabSession = sessionStorage.getItem("collaborator");
  const collab = collabSession ? JSON.parse(collabSession) : null;
  const collabId = collab?.id;
  const isAdmin = collab?.access_level === "admin";

  const loadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  // Only load tasks when panel is opened (not on every mount/navigation)
  useEffect(() => {
    if (!collabId || !open) return;
    if (hasLoadedRef.current) return;
    loadTasks();
  }, [collabId, open]);

  async function loadTasks() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      // Carregar tarefas próprias + tarefas enviadas para outros que ainda estão pendentes
      const [own, sent] = await Promise.all([
        base44.entities.MiniTask.filter({ collaborator_id: collabId }, "created_date", 200),
        base44.entities.MiniTask.filter({ sender_id: collabId, is_completed: false }, "created_date", 100),
      ]);
      // Mesclar sem duplicatas (tarefas enviadas para si mesmo já estão em own)
      const ownIds = new Set(own.map(t => t.id));
      const sentPending = sent.filter(t => !ownIds.has(t.id));
      setTasks([...own, ...sentPending]);
      hasLoadedRef.current = true;
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  async function addTask(e) {
    e.preventDefault();
    if (!newText.trim() || !collabId) return;
    setAdding(true);
    const created = await base44.entities.MiniTask.create({
      title: newText.trim(),
      collaborator_id: collabId,
      collaborator_name: collab?.name || "",
      is_completed: false,
    });
    setTasks(prev => [created, ...prev]);
    setNewText("");
    setAdding(false);
    inputRef.current?.focus();
  }

  async function toggleComplete(task) {
    const nowCompleted = !task.is_completed;
    const update = {
      is_completed: nowCompleted,
      completed_at: nowCompleted ? new Date().toISOString() : null,
    };
    await base44.entities.MiniTask.update(task.id, update);
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, ...update } : t))
    );
  }

  async function setDueDate(task, date, time) {
    const update = { due_date: date || null, due_time: time !== undefined ? (time || null) : undefined };
    // Remove undefined keys
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);
    await base44.entities.MiniTask.update(task.id, update);
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, ...update } : t))
    );
  }

  async function deleteTask(task) {
    await safeDelete("mini_task", "MiniTask", task);
    setTasks(prev => prev.filter(t => t.id !== task.id));
  }

  async function setPriority(task, newPriority) {
    const update = {
      priority: newPriority,
      priority_changed_by: newPriority > 0 ? collabId : null,
      priority_changed_by_name: newPriority > 0 ? (collab?.name || "") : null,
    };
    await base44.entities.MiniTask.update(task.id, update);
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, ...update } : t))
    );
  }

  async function updateChecklist(task, newChecklist) {
    await base44.entities.MiniTask.update(task.id, { checklist: newChecklist });
    setTasks(prev =>
      prev.map(t => (t.id === task.id ? { ...t, checklist: newChecklist } : t))
    );
  }

  // Ordenar: prioridade 2 (urgente) > 1 (alta) > 0 (normal), dentro da mesma prioridade: mais antiga primeiro
  const openTasks = useMemo(() =>
    tasks.filter(t => !t.is_completed).sort((a, b) => {
      const pa = a.priority || 0;
      const pb = b.priority || 0;
      if (pb !== pa) return pb - pa; // maior prioridade primeiro
      return new Date(a.created_date) - new Date(b.created_date); // mais antiga primeiro
    }),
    [tasks]
  );

  // All completed tasks (unfiltered by main search)
  const allCompleted = useMemo(() => tasks.filter(t => t.is_completed), [tasks]);

  // Filter completed by history search
  const historyFiltered = useMemo(() => {
    if (!historySearch.trim()) return allCompleted;
    const q = historySearch.toLowerCase();
    return allCompleted.filter(t => t.title?.toLowerCase().includes(q));
  }, [allCompleted, historySearch]);

  // Suggestions dropdown — show matching tasks while typing
  const historySuggestions = useMemo(() => {
    if (!historySearch.trim() || !historySearchFocused) return [];
    const q = historySearch.toLowerCase();
    return allCompleted
      .filter(t => t.title?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allCompleted, historySearch, historySearchFocused]);

  // Group completed by user, then by day within each user
  const completedGroups = useMemo(() => {
    const userMap = {};
    historyFiltered.forEach(t => {
      const userId = t.collaborator_id || "unknown";
      const userName = t.collaborator_name || "Sem dono";
      const day = t.completed_at ? t.completed_at.slice(0, 10) : "sem-data";
      
      if (!userMap[userId]) userMap[userId] = { name: userName, dayMap: {} };
      if (!userMap[userId].dayMap[day]) userMap[userId].dayMap[day] = [];
      userMap[userId].dayMap[day].push(t);
    });

    return Object.entries(userMap)
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([userId, user]) => ({
        userId,
        userName: user.name,
        days: Object.entries(user.dayMap)
          .sort(([dayA], [dayB]) => dayB.localeCompare(dayA))
          .map(([day, items]) => ({ day, items }))
      }));
  }, [historyFiltered]);

  const pendingCount = tasks.filter(t => !t.is_completed).length;

  if (!collabId) return null;

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setOpen(v => { const next = !v; sessionStorage.setItem("todoListOpen", next); return next; })}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[60] w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="To-Do List"
      >
        <ListTodo className="w-5 h-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        )}
      </button>

      {/* Panel — fixed height from header (56px) to FAB */}
      {open && (
        <div className="fixed right-4 md:right-6 z-[61] w-[340px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col animate-slide-up overflow-hidden"
          style={{ top: "calc(56px + env(safe-area-inset-top, 0px) + 8px)", bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}
        >
          {/* Header */}
          <div className="px-3 pt-3 pb-2 border-b border-border bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-foreground">Minhas Tarefas</h3>
              <button onClick={() => { setOpen(false); sessionStorage.setItem("todoListOpen", "false"); }} className="text-muted-foreground hover:text-foreground p-1 no-touch-min">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Tabs */}
            <div className="flex bg-muted rounded-lg p-0.5">
              <button
                onClick={() => { setTab("tasks"); setHistorySearch(""); }}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all no-touch-min ${
                  tab === "tasks"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListTodo className="w-3.5 h-3.5" />
                Tarefas
                {pendingCount > 0 && (
                  <span className="text-[9px] bg-primary/10 text-primary font-bold px-1 py-0.5 rounded-full leading-none">
                    {pendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setTab("history"); setExpandedDay(null); }}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all no-touch-min ${
                  tab === "history"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Histórico
              </button>
              <button
                onClick={() => setTab("team")}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all no-touch-min ${
                  tab === "team"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Equipe
              </button>
              <button
                onClick={() => setTab("notes")}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all no-touch-min ${
                  tab === "notes"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Notas
              </button>
            </div>
          </div>

          {tab === "notes" ? (
            <NotesTab />
          ) : tab === "team" ? (
            <TeamTasksTab />
          ) : tab === "tasks" ? (
            <>
              {/* Add task for myself */}
              <form onSubmit={addTask} className="px-3 py-2 border-b border-border flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Nova tarefa..."
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  className="flex-1 bg-muted/50 rounded-lg px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={!newText.trim() || adding}
                  className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 no-touch-min"
                >
                  {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </form>

              {/* Send task to another collaborator */}
              <SendTaskForm currentCollab={collab} onTaskSent={loadTasks} />

              {/* Task list — only open tasks */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : openTasks.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Nenhuma tarefa pendente
                  </div>
                ) : (
                  <div className="px-2 pt-2 pb-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide px-1 mb-1">
                      Abertas ({openTasks.length})
                    </p>
                    <div className="space-y-0.5">
                      {openTasks.map(t => (
                        <TodoItem
                          key={t.id}
                          task={t}
                          onToggle={t.collaborator_id === collabId ? () => toggleComplete(t) : undefined}
                          onSetDate={(isAdmin || t.collaborator_id === collabId) ? (d, time) => setDueDate(t, d, time) : undefined}
                          onDelete={(isAdmin || t.collaborator_id === collabId) ? () => deleteTask(t) : undefined}
                          onSetPriority={(t.collaborator_id === collabId || isAdmin) ? (p) => setPriority(t, p) : undefined}
                          isSentByMe={t.sender_id === collabId && t.collaborator_id !== collabId}
                          onChecklistChange={(isAdmin || t.collaborator_id === collabId) ? (list) => updateChecklist(t, list) : undefined}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* History tab — search + completed days as accordion */
            <>
              {/* History search with dropdown */}
              <div className="px-3 py-2 border-b border-border relative">
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1.5">
                  <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Pesquisar no histórico..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    onFocus={() => setHistorySearchFocused(true)}
                    onBlur={() => setTimeout(() => setHistorySearchFocused(false), 150)}
                    className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  />
                  {historySearch && (
                    <button onClick={() => setHistorySearch("")} className="text-muted-foreground hover:text-foreground no-touch-min p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {/* Suggestions dropdown */}
                {historySuggestions.length > 0 && (
                  <div className="absolute left-3 right-3 top-full mt-0.5 bg-card border border-border rounded-lg shadow-lg z-10 max-h-44 overflow-y-auto">
                    {historySuggestions.map(t => {
                      const dayLabel = t.completed_at
                        ? format(new Date(t.completed_at.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })
                        : "—";
                      return (
                        <button
                          key={t.id}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors no-touch-min"
                          onMouseDown={() => {
                            setHistorySearch(t.title);
                            setHistorySearchFocused(false);
                          }}
                        >
                          <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                          <span className="text-[11px] text-foreground truncate flex-1">{t.title}</span>
                          <span className="text-[9px] text-muted-foreground flex-shrink-0">{dayLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {completedGroups.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    {historySearch ? "Nenhuma tarefa encontrada" : "Nenhuma tarefa concluída"}
                  </div>
                ) : (
                  <div className="px-2 pt-2 pb-2 space-y-1">
                    {completedGroups.map(user => (
                      <div key={user.userId}>
                        <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                          {user.userName}
                        </div>
                        <div className="space-y-0.5 ml-2">
                          {user.days.map(dayGroup => (
                            <TodoCompletedGroup
                              key={`${user.userId}-${dayGroup.day}`}
                              day={dayGroup.day}
                              items={dayGroup.items}
                              onToggle={toggleComplete}
                              onDelete={deleteTask}
                              isExpanded={expandedDay === `${user.userId}-${dayGroup.day}`}
                              onToggleExpand={() => setExpandedDay(prev => prev === `${user.userId}-${dayGroup.day}` ? null : `${user.userId}-${dayGroup.day}`)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}