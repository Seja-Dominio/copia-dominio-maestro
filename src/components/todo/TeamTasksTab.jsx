import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Search, Loader2, ChevronDown, ChevronRight, Users } from "lucide-react";
import TodoItem from "./TodoItem";

export default function TeamTasksTab() {
  const [allTasks, setAllTasks] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedCollab, setExpandedCollab] = useState(null);

  const myCollab = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; }
  }, []);
  const myCollabId = myCollab?.id;
  const isAdmin = myCollab?.access_level === "admin";

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [tasks, collabs] = await Promise.all([
      base44.entities.MiniTask.list("-created_date", 1000),
      base44.entities.Collaborator.filter({ is_active: true }, "name", 200),
    ]);
    setAllTasks(tasks);
    setCollaborators(collabs);
    setLoading(false);
  }

  async function toggleComplete(task) {
    const nowCompleted = !task.is_completed;
    const update = { is_completed: nowCompleted, completed_at: nowCompleted ? new Date().toISOString() : null };
    await base44.entities.MiniTask.update(task.id, update);
    setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...update } : t));
  }

  async function deleteTask(task) {
    await base44.entities.MiniTask.delete(task.id);
    setAllTasks(prev => prev.filter(t => t.id !== task.id));
  }

  async function setDueDate(task, date, time) {
    const update = { due_date: date || null, due_time: time || null };
    await base44.entities.MiniTask.update(task.id, update);
    setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...update } : t));
  }

  async function setPriority(task, newPriority) {
    const update = {
      priority: newPriority,
      priority_changed_by: myCollabId,
      priority_changed_by_name: myCollab?.name || "",
    };
    if (newPriority === 0) {
      update.priority_changed_by = null;
      update.priority_changed_by_name = null;
    }
    await base44.entities.MiniTask.update(task.id, update);
    setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...update } : t));
  }

  // Group open tasks by collaborator
  const grouped = useMemo(() => {
    const openTasks = allTasks.filter(t => !t.is_completed);
    const filtered = search.trim()
      ? openTasks.filter(t => t.title?.toLowerCase().includes(search.toLowerCase()) || t.collaborator_name?.toLowerCase().includes(search.toLowerCase()))
      : openTasks;

    const map = {};
    filtered.forEach(t => {
      const cid = t.collaborator_id || "unknown";
      if (!map[cid]) map[cid] = { tasks: [], name: t.collaborator_name || "Sem dono" };
      map[cid].tasks.push(t);
    });

    // Sort by collaborator name and enrich with collab data
    // Non-admin users cannot see admin tasks
    return collaborators
      .filter(c => c.id !== myCollabId && map[c.id] && (isAdmin || c.access_level !== "admin"))
      .map(c => ({
        id: c.id,
        name: c.name,
        color: c.color,
        access_level: c.access_level,
        tasks: map[c.id]?.tasks.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)) || [],
      }))
      .filter(g => g.tasks.length > 0);
  }, [allTasks, collaborators, search, myCollabId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1.5">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar tarefa ou pessoa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            {search ? "Nenhuma tarefa encontrada" : "Nenhuma tarefa pendente na equipe"}
          </div>
        ) : (
          <div className="px-2 pt-2 pb-2 space-y-1">
            {grouped.map(g => {
              const isOpen = expandedCollab === g.id;
              return (
                <div key={g.id}>
                  <button
                    onClick={() => setExpandedCollab(prev => prev === g.id ? null : g.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors no-touch-min"
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: g.color || "hsl(var(--primary))" }}>
                      {g.name?.[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-foreground flex-1 text-left truncate">{g.name}</span>
                    {g.access_level === "admin" && (
                      <span className="text-[8px] bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 px-1 py-0.5 rounded font-bold">ADM</span>
                    )}
                    <span className="text-[10px] bg-muted text-muted-foreground font-bold px-1.5 py-0.5 rounded-full">
                      {g.tasks.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ml-4 space-y-0.5">
                      {g.tasks.map(t => (
                        <TodoItem
                          key={t.id}
                          task={t}
                          onToggle={() => toggleComplete(t)}
                          onSetDate={isAdmin ? (d, time) => setDueDate(t, d, time) : undefined}
                          onDelete={isAdmin ? () => deleteTask(t) : undefined}
                          onSetPriority={isAdmin ? (p) => setPriority(t, p) : undefined}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}