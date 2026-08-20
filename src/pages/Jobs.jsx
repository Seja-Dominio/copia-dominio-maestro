import { useState, useEffect, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useStatusConfig } from "@/lib/AppConfigContext";
import { usePullToRefresh } from "@/hooks/usePullToRefresh.jsx";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, LayoutList, Kanban, Table2, Clock,
  Calendar, AlertCircle, GripVertical, ChevronRight,
  User, Filter, Users, Building2
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import JobDetailModal from "../components/jobs/JobDetailModal";
import CreateJobModal from "../components/jobs/CreateJobModal";
import KanbanView from "../components/jobs/KanbanView";
import JobsListView from "@/components/jobs/JobsListView";
import SubtasksPautaView from "@/components/jobs/SubtasksPautaView";

export { DEFAULT_STATUS_CONFIG as STATUS_CONFIG } from "@/lib/AppConfigContext";
// Re-export for backward compat with components that still import from here

const VIEWS = [
  { id: "pautas", label: "Minhas Tarefas", icon: LayoutList },
  { id: "kanban", label: "Kanban", icon: Kanban },
  { id: "table", label: "Tabela", icon: Table2 },
  { id: "timesheet", label: "Timesheet", icon: Clock },
];

export default function Jobs() {
  const { statusConfig: STATUS_CONFIG } = useStatusConfig();
  const [jobs, setJobs] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => sessionStorage.getItem("jobsView") || "kanban");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [user, setUser] = useState(null);
  const [jobFilter, setJobFilter] = useState("all"); // "all" | "mine" | "overdue"
  const [teamFilter, setTeamFilter] = useState("all");
  const [projects, setProjects] = useState([]);
  const [collaboratorFilter, setCollaboratorFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("client") || "all";
  });
  const [activeClients, setActiveClients] = useState([]);
  const [activeCollaborators, setActiveCollaborators] = useState([]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadData();
    base44.entities.Collaborator.filter({ is_active: true }, "name", 100).then(setActiveCollaborators);
    base44.entities.Client.filter({ status: "active" }, "name", 500).then(setActiveClients);
  }, []);

  // Salvar view quando mudar
  useEffect(() => {
    sessionStorage.setItem("jobsView", view);
  }, [view]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [j, s, p] = await Promise.all([
      base44.entities.Job.list("-post_date", 5000),
      base44.entities.Subtask.list("-created_date", 5000),
      base44.entities.Project.list("-created_date", 5000),
    ]);
    // Only keep jobs from active projects (not completed/archived, and current or future reference_month)
    const currentMonth = format(new Date(), "yyyy-MM");
    const activeProjectIds = new Set(
      p.filter(pr => {
        if (pr.status === "completed" || pr.status === "archived") return false;
        if (pr.reference_month && pr.reference_month < currentMonth) return false;
        return true;
      }).map(pr => pr.id)
    );
    const activeJobs = j.filter(job => job.status !== "cancelled" && activeProjectIds.has(job.project_id));
    const activeJobIds = new Set(activeJobs.map(job => job.id));
    setJobs(activeJobs);
    setSubtasks(s.filter(sub => activeJobIds.has(sub.job_id)));
    setProjects(p);
    setLoading(false);
  }, []);

  // Abrir job direto pela URL (?job=ID)
  useEffect(() => {
    if (!jobs.length) return;
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    if (jobId && !selectedJob) {
      const job = jobs.find(j => j.id === jobId);
      if (job) setSelectedJob(job);
    }
  }, [jobs]);

  function updateJobUrl(jobId) {
    const params = new URLSearchParams();
    if (jobId) params.set("job", jobId);
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  }

  function handleSelectJob(job) {
    setSelectedJob(job);
    updateJobUrl(job.id);
  }

  function handleCloseJob() {
    setSelectedJob(null);
    updateJobUrl(null);
  }

  const { containerRef, handlers, PullIndicator } = usePullToRefresh(loadData);

  async function updateJobStatus(jobId, status) {
    const prev = jobs.find(j => j.id === jobId)?.status;
    // Optimistic update
    setJobs(curr => curr.map(j => j.id === jobId ? { ...j, status } : j));
    try {
      await base44.entities.Job.update(jobId, { status });
    } catch {
      // Revert on error
      setJobs(curr => curr.map(j => j.id === jobId ? { ...j, status: prev } : j));
    }
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const collaborator = JSON.parse(sessionStorage.getItem("collaborator") || "{}");
  const collabId = collaborator?.id;

  // IDs dos jobs onde o colaborador tem subtasks
  const mySubtaskJobIds = useMemo(() => {
    if (!collabId) return new Set();
    return new Set(subtasks.filter(s => s.responsible_id === collabId).map(s => s.job_id).filter(Boolean));
  }, [subtasks, collabId]);

  const isMyJob = (j) => j.responsible_id === collabId || (j.involved || []).includes(collabId) || mySubtaskJobIds.has(j.id);

  // Map project_id -> teams for team filtering
  const projectTeamsMap = useMemo(() => {
    const map = {};
    projects.forEach(p => { map[p.id] = p.teams || []; });
    return map;
  }, [projects]);

  const [availableTeams, setAvailableTeams] = useState([]);
  useEffect(() => {
    base44.entities.Squad.filter({ is_active: true }, "name", 100).then(squads => {
      setAvailableTeams(squads.map(s => s.name).sort());
    });
  }, []);

  const filtered = jobs
    .filter(j => {
      if (search && !j.title?.toLowerCase().includes(search.toLowerCase()) && !j.client_name?.toLowerCase().includes(search.toLowerCase())) return false;
      if (clientFilter !== "all") {
        if (j.client_id !== clientFilter) return false;
      }
      if (teamFilter !== "all") {
        const teams = projectTeamsMap[j.project_id] || [];
        const match = teams.some(t => t === teamFilter || t === `Equipe ${teamFilter}` || teamFilter === `Equipe ${t}`);
        if (!match) return false;
      }
      if (collaboratorFilter !== "all") {
        if (j.responsible_id !== collaboratorFilter && !(j.involved || []).includes(collaboratorFilter)) return false;
      }
      if (jobFilter === "mine") return isMyJob(j);
      if (jobFilter === "overdue") return isMyJob(j) && j.post_date && j.post_date <= today && j.status !== "completed" && j.status !== "scheduled" && j.status !== "cancelled";
      return true;
    })
    .sort((a, b) => {
      const aCancelled = a.status === "cancelled" ? 1 : 0;
      const bCancelled = b.status === "cancelled" ? 1 : 0;
      if (aCancelled !== bCancelled) return aCancelled - bCancelled;
      const da = a.post_date || "9999-99-99";
      const db = b.post_date || "9999-99-99";
      return da.localeCompare(db);
    });

  function getSubtasksForJob(jobId) {
    return subtasks.filter(s => s.job_id === jobId);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card overflow-x-auto flex-shrink-0">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              view === v.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <v.icon className="w-3.5 h-3.5" />
            {v.label}
          </button>
        ))}

        {/* Divisória */}
        <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />

        {/* Filtros */}
        {[
          { id: "all", label: "Todos os Jobs", icon: Filter },
          { id: "mine", label: "Meus Jobs", icon: User },
          { id: "overdue", label: "Atrasados", icon: AlertCircle },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setJobFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              jobFilter === f.id
                ? f.id === "overdue"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
          </button>
        ))}

        {availableTeams.length > 0 && (
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs gap-1 border-border no-touch-min">
              <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <SelectValue placeholder="Equipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas equipes</SelectItem>
              {availableTeams.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs gap-1 border-border no-touch-min">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <SelectValue placeholder="Cliente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos clientes</SelectItem>
            {activeClients.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={collaboratorFilter} onValueChange={setCollaboratorFilter}>
          <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs gap-1 border-border no-touch-min">
            <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <SelectValue placeholder="Colaborador" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos colaboradores</SelectItem>
            {activeCollaborators.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs w-48"
              placeholder="Buscar jobs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Job
          </Button>
        </div>
      </div>

      {/* Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
        {...handlers}
      >
        <PullIndicator />
        {!loading && (
          <>
            {view === "pautas" && (
              <SubtasksPautaView
                subtasks={subtasks}
                jobs={jobs}
                collabId={collabId}
                isAdmin={collaborator?.access_level === "admin"}
                onSelectJob={handleSelectJob}
                onSubtaskComplete={async (subtaskId) => {
                  // Optimistic: remove from list immediately
                  setSubtasks(prev => prev.map(s => s.id === subtaskId ? { ...s, status: "completed", is_completed: true } : s));
                  await base44.entities.Subtask.update(subtaskId, { status: "completed", is_completed: true, completed_at: new Date().toISOString() });
                }}
              />
            )}
            {view === "kanban" && (
              <KanbanView
                jobs={filtered}
                subtasks={subtasks}
                getSubtasksForJob={getSubtasksForJob}
                onSelectJob={handleSelectJob}
                onUpdateStatus={updateJobStatus}
                today={today}
              />
            )}
            {view === "table" && (
              <div className="p-6">
                <div className="glass-card overflow-hidden">
                  <table className="w-full text-sm">
                   <thead className="bg-muted border-b border-border">
                     <tr>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Nº</th>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Job</th>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Projeto</th>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Post</th>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Entrega</th>
                       <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Responsável</th>
                     </tr>
                   </thead>
                   <tbody>
                     {filtered.map(j => {
                       const sc = STATUS_CONFIG[j.status] || STATUS_CONFIG.pending_briefing;
                       const isLate = j.delivery_date && j.delivery_date < today && j.status !== "completed";
                       return (
                         <tr
                           key={j.id}
                           onClick={() => handleSelectJob(j)}
                           className="border-b border-border hover:bg-muted/50 cursor-pointer transition-colors"
                         >
                            <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{j.number || "—"}</td>
                            <td className="px-4 py-3 font-medium text-foreground">{j.title}</td>
                            <td className="px-4 py-3 text-muted-foreground">{j.client_name || "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{j.project_name || "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`status-badge ${sc.color} border`}>{sc.label}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {j.post_date ? format(new Date(j.post_date + "T12:00:00"), "dd/MM/yyyy") : "—"}
                            </td>
                            <td className={`px-4 py-3 text-xs font-medium ${isLate ? "text-destructive" : "text-muted-foreground"}`}>
                              {j.delivery_date ? format(new Date(j.delivery_date), "dd/MM/yyyy") : "—"}
                              {isLate && <AlertCircle className="w-3 h-3 inline ml-1" />}
                            </td>
                            <td className="px-4 py-3">
                              {j.responsible_name && (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-xs">
                                    {j.responsible_name[0]?.toUpperCase()}
                                  </div>
                                  <span className="text-xs text-muted-foreground">{j.responsible_name}</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">Nenhum job encontrado</div>
                  )}
                </div>
              </div>
            )}
            {view === "timesheet" && (
              <TimesheetView />
            )}
          </>
          )}
      </div>

      {selectedJob && ReactDOM.createPortal(
        <JobDetailModal
          job={selectedJob}
          subtasks={getSubtasksForJob(selectedJob.id)}
          onClose={handleCloseJob}
          onUpdate={updated => {
            setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
            setSelectedJob(updated);
          }}
          onSubtasksChange={async () => {
            const s = await base44.entities.Subtask.list("-created_date", 5000);
            setSubtasks(s);
          }}
        />,
        document.body
      )}

      {showCreate && (
        <CreateJobModal
          onClose={() => setShowCreate(false)}
          onCreate={newJob => {
            setJobs(prev => [newJob, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function TimesheetView() {
  const [timesheets, setTimesheets] = useState([]);
  const [timerId, setTimerId] = useState(null);

  useEffect(() => {
    const loadTimesheets = async () => {
      const ts = await base44.entities.Timesheet.list("-created_date", 200);
      setTimesheets(ts);
    };
    
    loadTimesheets();
    // Atualizar a cada 10 segundos para sincronizar timers
    setTimerId(setInterval(loadTimesheets, 10000));
    
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, []);

  const today = format(new Date(), "yyyy-MM-dd");
  
  // Timers ativos de hoje
  const activeTodayGroup = timesheets
    .filter(t => t.is_running && t.started_at?.startsWith(today))
    .reduce((acc, t) => {
      const key = t.collaborator_id;
      if (!acc[key]) acc[key] = { collaborator: t.collaborator_name, items: [] };
      acc[key].items.push(t);
      return acc;
    }, {});

  // Resumo semanal por usuário (últimos 7 dias)
  const sevenDaysAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const weeklyGroup = timesheets
    .filter(t => !t.is_running && t.started_at >= sevenDaysAgo)
    .reduce((acc, t) => {
      const key = t.collaborator_id;
      if (!acc[key]) acc[key] = { collaborator: t.collaborator_name, total: 0 };
      acc[key].total += t.duration_minutes || 0;
      return acc;
    }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Timers de hoje */}
      {Object.keys(activeTodayGroup).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Tempo Real - Hoje
          </h3>
          <div className="space-y-3">
            {Object.entries(activeTodayGroup).map(([collab_id, data]) => (
              <div key={collab_id} className="glass-card p-4 border-l-4 border-green-500">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-foreground">{data.collaborator}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-semibold text-green-600">Em andamento</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {data.items.map(t => (
                    <div key={t.id} className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{t.job_title}</p>
                      <Clock className="w-3 h-3 text-green-500" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumo semanal */}
      {Object.keys(weeklyGroup).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Compilado Semanal (Últimos 7 dias)</h3>
          <div className="glass-card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Usuário</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Agora</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(weeklyGroup)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([collab_id, data]) => {
                    const hours = Math.floor(data.total / 60);
                    const mins = data.total % 60;
                    const activeItems = activeTodayGroup[collab_id]?.items;
                    return (
                      <tr key={collab_id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium text-foreground">{data.collaborator}</td>
                        <td className="px-4 py-3">
                          {activeItems?.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                              <span className="text-green-700 font-medium truncate max-w-[250px]">
                                {activeItems.map(t => t.job_title).join(", ")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground font-semibold">
                          {hours}h {mins}min
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Object.keys(activeTodayGroup).length === 0 && Object.keys(weeklyGroup).length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum timesheet registrado</p>
        </div>
      )}
    </div>
  );
}