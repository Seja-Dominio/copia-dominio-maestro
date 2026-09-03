import { useState, useEffect, memo, useMemo, useCallback } from "react";

import { usePullToRefresh } from "@/hooks/usePullToRefresh.jsx";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Star, FolderKanban, Clock,
  Calendar, Archive, CheckCircle2, Circle,
  Crown, Users, X
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ProjectDetailModal from "../components/projects/ProjectDetailModal";
import CreateProjectModal from "../components/projects/CreateProjectModal";
import ProjectJobsView from "../components/projects/ProjectJobsView";
import AllJobsCalendar from "../components/projects/AllJobsCalendar";
import BulkScheduleDownload from "../components/projects/BulkScheduleDownload";
import { useStatusConfig } from "@/lib/AppConfigContext";

const statusConfig = {
  no_status: { label: "Sem status", color: "bg-gray-100 text-gray-600", icon: Circle },
  in_progress: { label: "Em andamento", color: "bg-blue-100 text-blue-700", icon: Clock },
  completed: { label: "Concluído", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  archived: { label: "Arquivado", color: "bg-gray-100 text-gray-500", icon: Archive },
};

const ProjectCard = memo(function ProjectCard({ project, jobs, client, onClick, onToggleFavorite, totalMinutes, statusList }) {
  const activeJobs = jobs.filter(j => j.status !== "cancelled");
  const total = activeJobs.length;

  // Compute progress based on each job's position in the status pipeline
  const pct = useMemo(() => {
    if (total === 0) return 0;
    // Build status order from statusList (excluding cancelled)
    const steps = (statusList || []).filter(s => s.key !== "cancelled").map(s => s.key);
    const maxIdx = steps.length - 1; // completed = last step = 100%
    if (maxIdx <= 0) return 0;
    const totalProgress = activeJobs.reduce((sum, job) => {
      const idx = steps.indexOf(job.status);
      // If status not found, treat as 0 progress
      return sum + (idx >= 0 ? idx / maxIdx : 0);
    }, 0);
    return Math.round((totalProgress / total) * 100);
  }, [activeJobs, total, statusList]);

  const completed = activeJobs.filter(j => j.status === "completed" || j.status === "scheduled").length;
  const pctColor = pct === 100 ? "text-green-600" : pct >= 50 ? "text-blue-600" : "text-muted-foreground";
  const barColor = pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-primary";
  const totalHours = (totalMinutes || 0) / 60;

  // Tarja: baseada no campo `tier` do cliente (somente 1)
  const tierColors = {
    elite:       { border: "#f59e0b", bg: "#fef3c7", text: "#78350f", label: "Elite" },
    performance: { border: "#3b82f6", bg: "#dbeafe", text: "#1e3a8a", label: "Performance" },
    trafego:     { border: "#eab308", bg: "#fefce8", text: "#713f12", label: "Tráfego" },
  };
  const tierKey = client?.tier || "";
  const tierStyle = tierColors[tierKey];
  const clientServices = (client?.services || []);
  const SERVICE_COLORS = {
    conteudo_instagram_facebook: { bg: "#ede9fe", text: "#5b21b6", label: "Conteúdo IG/FB" },
    conteudo_tiktok:             { bg: "#fce7f3", text: "#9d174d", label: "Conteúdo TikTok" },
    trafego_meta:                { bg: "#dbeafe", text: "#1e3a8a", label: "Tráfego Meta" },
    trafego_google:              { bg: "#ffedd5", text: "#7c2d12", label: "Tráfego Google" },
    trafego_linkedin:            { bg: "#e0f2fe", text: "#0c4a6e", label: "Tráfego LinkedIn" },
    crm:                         { bg: "#d1fae5", text: "#064e3b", label: "CRM" },
    treinamentos:                { bg: "#fef3c7", text: "#78350f", label: "Treinamentos" },
  };

  return (
    <div
      className="glass-card p-5 cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group animate-fade-in overflow-hidden relative"
      onClick={() => onClick(project)}
      style={tierStyle ? { borderTop: `3px solid ${tierStyle.border}` } : {}}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            #{project.number || "—"}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(project); }}
            aria-label={project.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            className={`p-0.5 rounded transition-colors ${project.is_favorite ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"}`}
          >
            <Star className="w-3.5 h-3.5" fill={project.is_favorite ? "currentColor" : "none"} />
          </button>
          {/* Tarja única do cliente */}
          {tierStyle && (
            <span
              className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold border"
              style={{ backgroundColor: tierStyle.bg, color: tierStyle.text, borderColor: tierStyle.border }}
            >
              {tierKey === "elite" && <Crown className="w-2.5 h-2.5" fill="currentColor" />}
              {tierStyle.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalHours > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
              <Clock className="w-3 h-3" />
              {totalHours.toFixed(1)}h gastas
            </span>
          )}
          <span className={`text-xs font-semibold ${pctColor}`}>
            {total > 0 ? `${completed}/${total} jobs` : "Sem jobs"}
          </span>
        </div>
      </div>

      {/* Serviços do cliente */}
      {clientServices.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {clientServices.map(s => {
            const svc = SERVICE_COLORS[s];
            return svc ? (
              <span key={s} className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold" style={{ backgroundColor: svc.bg, color: svc.text }}>
                {svc.label}
              </span>
            ) : null;
          })}
        </div>
      )}

      <h3 className="font-semibold text-foreground mb-1 line-clamp-2 group-hover:text-primary transition-colors">
        {project.name}
      </h3>
      <p className="text-sm text-muted-foreground mb-2">{project.client_name || "—"}</p>

      {total > 0 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Progresso</span>
            <span className={`font-semibold ${pctColor}`}>{pct}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {project.estimated_deadline && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{format(new Date(project.estimated_deadline), "dd/MM/yy")}</span>
            </div>
          )}
          {project.budget && (
            <span>R$ {Number(project.budget).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</span>
          )}
        </div>
        {project.responsible_name && (
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
            {project.responsible_name[0]?.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
});

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState(() => localStorage.getItem("projectsTeamFilter") || "");

  const [selectedProject, setSelectedProject] = useState(null);
  const [openProjectJobs, setOpenProjectJobs] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [pendingJobId, setPendingJobId] = useState(null);

  const collabSession = JSON.parse(sessionStorage.getItem("collaborator") || "null");
  const isAdmin = collabSession?.access_level === "admin" || collabSession?.access_level === "master";
  const { statusList } = useStatusConfig();

  const [jobsByProject, setJobsByProject] = useState({});
  const [clientsById, setClientsById] = useState({});
  const [hoursByProject, setHoursByProject] = useState({});

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const [data, jobs, clients, timesheets] = await Promise.all([
      base44.entities.Project.list("-created_date", 100),
      base44.entities.Job.list("-created_date", 500),
      base44.entities.Client.list("name", 200),
      base44.entities.Timesheet.filter({ is_running: false }, "-created_date", 2000),
    ]);
    setProjects(data);
    const grouped = {};
    jobs.forEach(j => {
      if (!grouped[j.project_id]) grouped[j.project_id] = [];
      grouped[j.project_id].push(j);
    });
    setJobsByProject(grouped);
    const byId = {};
    clients.forEach(c => { byId[c.id] = c; });
    setClientsById(byId);
    // Calcular horas por projeto a partir dos timesheets
    const hByProject = {};
    timesheets.forEach(t => {
      if (t.project_id && t.duration_minutes) {
        hByProject[t.project_id] = (hByProject[t.project_id] || 0) + t.duration_minutes;
      }
    });
    setHoursByProject(hByProject);
    setLoading(false);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Restore state from URL on load — skip archived/completed projects
  useEffect(() => {
    if (loading || projects.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    const jobId = params.get("job");
    if (projectId && !openProjectJobs) {
      const p = projects.find(pr => pr.id === projectId);
      if (p) {
        const eff = getEffectiveStatus(p);
        if (eff === "completed" || eff === "archived") {
          // Don't auto-open finished projects — clear URL
          updateUrl();
          return;
        }
        setOpenProjectJobs(p);
        if (jobId) setPendingJobId(jobId);
      }
    }
  }, [loading, projects]);

  // Sync URL when project/job view changes
  function updateUrl(projectId, jobId) {
    const params = new URLSearchParams();
    if (projectId) params.set("project", projectId);
    if (jobId) params.set("job", jobId);
    const qs = params.toString();
    const newUrl = window.location.pathname + (qs ? "?" + qs : "");
    window.history.replaceState(null, "", newUrl);
  }

  function handleOpenProject(project) {
    setOpenProjectJobs(project);
    updateUrl(project.id);
  }

  function handleCloseProject() {
    setOpenProjectJobs(null);
    setPendingJobId(null);
    updateUrl();
  }
const { containerRef, handlers, PullIndicator } = usePullToRefresh(loadProjects);

  async function toggleFavorite(project) {
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, is_favorite: !project.is_favorite } : p));
    try {
      await base44.entities.Project.update(project.id, { is_favorite: !project.is_favorite });
    } catch {
      // Revert on error
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, is_favorite: project.is_favorite } : p));
    }
  }

  // Calcula status efetivo: se tem jobs não concluídos/cancelados → em andamento
  const getEffectiveStatus = useCallback((project) => {
    // Respect explicit archived status
    if (project.status === "archived") return "archived";
    const pJobs = jobsByProject[project.id] || [];
    if (pJobs.length < 2) return project.status || "no_status";
    const hasOpenJobs = pJobs.some(j => j.status !== "completed" && j.status !== "cancelled" && j.status !== "scheduled");
    if (hasOpenJobs) return "in_progress";
    // All jobs completed/cancelled with 2+ jobs → auto completed
    return "completed";
  }, [jobsByProject]);

  // Carregar squads para filtro de equipes
  const [allTeams, setAllTeams] = useState([]);
  useEffect(() => {
    base44.entities.Squad.filter({ is_active: true }, "name", 100).then(squads => {
      setAllTeams(squads.map(s => s.name).sort());
    });
  }, []);

  const matchesSearch = useCallback((p) => {
    const textMatch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.client_name?.toLowerCase().includes(search.toLowerCase());
    const teamMatch = !teamFilter || (p.teams?.length ? p.teams.includes(teamFilter) : p.team === teamFilter);
    return textMatch && teamMatch;
  }, [search, teamFilter]);

  // Projetos ativos (em andamento) e finalizados (concluído/arquivado)
  const { activeProjects, finishedProjects } = useMemo(() => {
    const active = [];
    const finished = [];
    projects.forEach(p => {
      if (!matchesSearch(p)) return;
      const eff = getEffectiveStatus(p);
      if (eff === "completed" || eff === "archived") {
        finished.push(p);
      } else {
        active.push(p);
      }
    });
    return { activeProjects: active, finishedProjects: finished };
  }, [projects, matchesSearch, getEffectiveStatus]);

  const filtered = useMemo(() => [...activeProjects, ...finishedProjects], [activeProjects, finishedProjects]);

  if (openProjectJobs) {
    return (
      <ProjectJobsView
        project={openProjectJobs}
        onBack={handleCloseProject}
        isAdmin={isAdmin}
        initialJobId={pendingJobId}
        onJobSelect={(jobId) => updateUrl(openProjectJobs.id, jobId)}
        onJobClose={() => updateUrl(openProjectJobs.id)}
        onProjectUpdate={updated => {
          if (!updated) {
            setProjects(prev => prev.filter(p => p.id !== openProjectJobs.id));
            setOpenProjectJobs(null);
          } else {
            setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
            setOpenProjectJobs(updated);
            // Reload all data so jobsByProject is in sync (e.g. after archive)
            loadProjects();
          }
        }}
      />
    );
  }

  return (
    <div ref={containerRef} className="p-6" style={{ WebkitOverflowScrolling: "touch" }} {...handlers}>
      <PullIndicator />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projetos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Exibindo {filtered.length} de {projects.length} projetos
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="outline" onClick={() => setShowCalendar(true)} className="gap-2">
            <Calendar className="w-4 h-4" /> Postagens
          </Button>
          <BulkScheduleDownload
            projects={projects}
            teamFilter={teamFilter}
            getEffectiveStatus={getEffectiveStatus}
          />
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo Projeto
          </Button>
        </div>
      </div>

      {/* Search + Team filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar projetos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {allTeams.length > 0 && (
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              className="h-9 pl-9 pr-8 rounded-md border border-input bg-background text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer min-w-[160px]"
              value={teamFilter}
              onChange={e => { setTeamFilter(e.target.value); localStorage.setItem("projectsTeamFilter", e.target.value); }}
            >
              <option value="">Todas as equipes</option>
              {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {teamFilter && (
              <button
                onClick={() => { setTeamFilter(""); localStorage.removeItem("projectsTeamFilter"); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="glass-card p-5 h-36 animate-pulse">
              <div className="h-4 bg-muted rounded mb-2 w-2/3" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-muted-foreground font-medium">Nenhum projeto encontrado</p>
          <Button className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" /> Criar primeiro projeto
          </Button>
        </div>
      ) : (
        <>
          {/* Projetos em andamento */}
          {activeProjects.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Em andamento ({activeProjects.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {activeProjects.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    jobs={jobsByProject[p.id] || []}
                    client={clientsById[p.client_id]}
                    totalMinutes={hoursByProject[p.id] || 0}
                    statusList={statusList}
                    onClick={handleOpenProject}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </>
          )}

          {/* Projetos concluídos / arquivados */}
          {finishedProjects.length > 0 && (
            <>
              <div className="border-t border-border my-6" />
              <h2 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Concluídos / Arquivados ({finishedProjects.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-70">
                {finishedProjects.map(p => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    jobs={jobsByProject[p.id] || []}
                    client={clientsById[p.client_id]}
                    totalMinutes={hoursByProject[p.id] || 0}
                    statusList={statusList}
                    onClick={handleOpenProject}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {selectedProject && (
        <div onClick={() => setSelectedProject(null)} className="fixed inset-0 z-40" />
      )}
      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onUpdate={updated => {
            setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
            setSelectedProject(updated);
          }}
        />
      )}

      {showCalendar && (
        <AllJobsCalendar
          jobs={Object.values(jobsByProject).flat().filter(j => j.status !== "cancelled")}
          onClose={() => setShowCalendar(false)}
          onJobClick={(job) => {
            setShowCalendar(false);
            const p = projects.find(pr => pr.id === job.project_id);
            if (p) {
              setOpenProjectJobs(p);
              setPendingJobId(job.id);
              updateUrl(p.id, job.id);
            }
          }}
        />
      )}

      {showCreate && (
        <div onClick={() => setShowCreate(false)} className="fixed inset-0 z-40" />
      )}
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          isAdmin={isAdmin}
          onCreate={newProject => {
            setProjects(prev => [newProject, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
