import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Plus, AlertTriangle, Clock, CheckCircle2,
  AlertCircle, Calendar, Briefcase, Image, Film, Play,
  BarChart3, FileText, Users, Archive, ArchiveRestore, Trash2, ChevronDown, Pencil, Check, X, Ban, StickyNote
} from "lucide-react";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useStatusConfig } from "@/lib/AppConfigContext";
import JobDetailModal from "../jobs/JobDetailModal";
import CreateJobModal from "../jobs/CreateJobModal";
import ScheduleCalendar from "./ScheduleCalendar";
import ProjectTimesheetModal from "./ProjectTimesheetModal";

const CONTENT_ICONS = {
  feed_card: Image,
  reels: Film,
  story: Play,
  video: Film,
  card_trafego: Image,
  video_trafego: Film,
  trafego_pago: BarChart3,
  foto: Image,
  promocao: Image,
  email: FileText,
  blog: FileText,
  outros: Briefcase,
};

export default function ProjectJobsView({ project, onBack, onProjectUpdate, isAdmin, initialJobId, onJobSelect, onJobClose }) {
  const { statusConfig: STATUS_CONFIG } = useStatusConfig();
  const [jobs, setJobs] = useState([]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const [allTeams, setAllTeams] = useState([]);
  const [projectData, setProjectData] = useState(project);
  const [showTimesheetModal, setShowTimesheetModal] = useState(false);
  const [deletedJobs, setDeletedJobs] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null); // { type, title, message, itemName, onConfirm }
  const [observations, setObservations] = useState([]); // { text, date, is_completed, id }

  const projectTeams = projectData.teams?.length ? projectData.teams : (projectData.team ? [projectData.team] : []);

  useEffect(() => {
    loadData();
    base44.entities.Squad.filter({ is_active: true }, "name", 100).then(squads => {
      setAllTeams(squads.map(s => s.name).sort());
    });
  }, [project.id]);

  // Inicializa selectedTeam com a primeira equipe
  useEffect(() => {
    if (selectedTeam === "" && projectTeams.length > 0) {
      setSelectedTeam(projectTeams[0]);
    }
  }, [projectTeams]);

  async function handleSaveName() {
    if (!nameValue.trim()) return;
    const updated = await base44.entities.Project.update(projectData.id, { name: nameValue.trim() });
    setProjectData(prev => ({ ...prev, name: nameValue.trim() }));
    setEditingName(false);
    onProjectUpdate && onProjectUpdate({ ...projectData, name: nameValue.trim() });
  }

  async function handleToggleTeam(team) {
    const currentTeams = projectData.teams?.length ? projectData.teams : (projectData.team ? [projectData.team] : []);
    const newTeams = currentTeams.includes(team)
      ? currentTeams.filter(t => t !== team)
      : [...currentTeams, team];
    const updated = await base44.entities.Project.update(projectData.id, { teams: newTeams });
    setProjectData(prev => ({ ...prev, teams: newTeams }));
    onProjectUpdate && onProjectUpdate({ ...projectData, teams: newTeams });
    if (!newTeams.includes(selectedTeam) && newTeams.length > 0) setSelectedTeam(newTeams[0]);
  }

  async function loadData() {
    setLoading(true);
    const [j, s, ts, c, collab, dlogs] = await Promise.all([
      base44.entities.Job.filter({ project_id: project.id }, "-created_date", 200),
      base44.entities.Subtask.list("-created_date", 500),
      base44.entities.Timesheet.filter({ project_id: project.id }, "-created_date", 500),
      project.client_id ? base44.entities.Client.filter({ id: project.client_id }, "name", 1) : Promise.resolve([]),
      base44.entities.Collaborator.filter({ is_active: true }, "name", 100),
      base44.entities.DeleteLog.filter({ entity_type: "job" }, "-deleted_at", 100),
    ]);
    setJobs(j);
    setSubtasks(s.filter(st => j.some(jb => jb.id === st.job_id)));
    setTimesheets(ts);
    setClient(c[0] || null);
    setCollaborators(collab);
    // Filter deleted jobs belonging to this project
    const projDeletedJobs = dlogs
      .filter(dl => dl.entity_data?.project_id === project.id)
      .map(dl => ({ ...dl.entity_data, _deletedAt: dl.deleted_at, _deletedBy: dl.deleted_by_name, _deleteLogId: dl.id }));
    setDeletedJobs(projDeletedJobs);
    // Extract observations from schedule_data
    const proj = await base44.entities.Project.filter({ id: project.id }, "id", 1);
    const schedData = proj[0]?.schedule_data || {};
    const obs = [];
    Object.entries(schedData).forEach(([dayStr, posts]) => {
      posts.forEach(p => {
        if (p.is_observation) obs.push({ ...p, date: dayStr });
      });
    });
    obs.sort((a, b) => a.date.localeCompare(b.date));
    setObservations(obs);
    setLoading(false);
  }

  // Open job from URL param after data loads
  useEffect(() => {
    if (!loading && initialJobId && jobs.length > 0 && !selectedJob) {
      const job = jobs.find(j => j.id === initialJobId);
      if (job) setSelectedJob(job);
    }
  }, [loading, initialJobId, jobs]);

  function handleSelectJob(job) {
    setSelectedJob(job);
    onJobSelect?.(job.id);
  }

  function handleCloseJob() {
    setSelectedJob(null);
    onJobClose?.();
  }

  const today = format(new Date(), "yyyy-MM-dd");
  const in5Days = format(addDays(new Date(), 5), "yyyy-MM-dd");

  const activeJobsAll = jobs.filter(j => j.status !== "cancelled");
  const cancelledJobs = jobs.filter(j => j.status === "cancelled");
  const overdueJobs = activeJobsAll.filter(j => j.post_date && j.post_date < today && j.status !== "completed" && j.status !== "scheduled");
  const notScheduledSoon = activeJobsAll.filter(j => j.post_date && j.post_date >= today && j.post_date <= in5Days && j.status !== "scheduled" && j.status !== "completed");
  const totalTimesheetMinutes = timesheets.filter(t => !t.is_running).reduce((s, t) => s + (t.duration_minutes || 0), 0);
  const totalHours = (totalTimesheetMinutes / 60).toFixed(1);

  // Minutes per job from timesheets
  const minutesByJob = timesheets.filter(t => !t.is_running).reduce((acc, t) => {
    if (t.job_id) acc[t.job_id] = (acc[t.job_id] || 0) + (t.duration_minutes || 0);
    return acc;
  }, {});
  const contractedDeliveries = client?.monthly_deliveries || null;

  // Count jobs by content_type (only active, non-cancelled)
  const FORMAT_COUNT_MAP = [
    { key: "feed_card", label: "Card", clientField: "contracted_cards", color: "#4ade80" },
    { key: "reels", label: "Reels", clientField: "contracted_reels", color: "#60a5fa" },
    { key: "feed_card_promo", label: "Promoção", clientField: "contracted_promocoes", color: "#f87171" },
    { key: "video", label: "VT", clientField: "contracted_vt", color: "#fb923c" },
    { key: "feed_card_foto", label: "Foto", clientField: "contracted_foto", color: "#fbbf24" },
    { key: "story", label: "Stories", clientField: "contracted_stories", color: "#a78bfa" },
  ];
  // Count by content_type from active non-cancelled jobs
  const jobContentCounts = activeJobsAll.filter(j => j.status !== "cancelled").reduce((acc, j) => {
    if (j.content_type) acc[j.content_type] = (acc[j.content_type] || 0) + 1;
    return acc;
  }, {});
  const totalContracted = (client?.contracted_cards || 0) + (client?.contracted_reels || 0) + 
    (client?.contracted_promocoes || 0) + (client?.contracted_vt || 0) + 
    (client?.contracted_foto || 0) + (client?.contracted_stories || 0);
  const isJobCountBelowContracted = contractedDeliveries && activeJobsAll.length < contractedDeliveries;

  function getSubtasksForJob(jobId) {
    return subtasks.filter(s => s.job_id === jobId);
  }

  function handleCompleteAndArchive() {
    setConfirmAction({
      type: "archive",
      title: "Concluir e Arquivar?",
      itemName: projectData.name,
      itemSubtext: " será arquivado.",
      confirmLabel: "Arquivar",
      confirmLoadingLabel: "Arquivando...",
      confirmVariant: "primary",
      message: "Todos os jobs (exceto cancelados) serão marcados como concluídos e o projeto será movido para a seção Concluídos/Arquivados.",
      onConfirm: async () => {
        setConfirmAction(null);
        setArchiving(true);
        await Promise.all(jobs.filter(j => j.status !== "cancelled").map(j => base44.entities.Job.update(j.id, { status: "completed" })));
        await Promise.all(subtasks.map(s => base44.entities.Subtask.update(s.id, { is_completed: true, status: "completed" })));
        await base44.entities.Project.update(project.id, { status: "archived" });
        const updatedProject = { ...projectData, status: "archived" };
        setArchiving(false);
        setProjectData(updatedProject);
        onProjectUpdate && onProjectUpdate(updatedProject);
      },
    });
  }

  function handleUnarchive() {
    setConfirmAction({
      type: "unarchive",
      title: "Desarquivar projeto?",
      itemName: projectData.name,
      itemSubtext: " voltará para a seção Em Andamento.",
      confirmLabel: "Desarquivar",
      confirmLoadingLabel: "Desarquivando...",
      confirmVariant: "primary",
      message: "O projeto voltará ao status 'Em andamento'.",
      onConfirm: async () => {
        setConfirmAction(null);
        setArchiving(true);
        const updated = await base44.entities.Project.update(project.id, { status: "in_progress" });
        setArchiving(false);
        setProjectData(prev => ({ ...prev, status: "in_progress" }));
        onProjectUpdate && onProjectUpdate(updated);
      },
    });
  }

  async function handleStatusChange(jobId, newStatus, e) {
    e.stopPropagation();
    const updated = await base44.entities.Job.update(jobId, { status: newStatus });
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
  }

  function handleDeleteJob(jobId, e) {
    e.stopPropagation();
    const job = jobs.find(j => j.id === jobId);
    const collab = JSON.parse(sessionStorage.getItem("collaborator") || "{}");
    setConfirmAction({
      type: "deleteJob",
      title: "Excluir job?",
      itemName: job?.title || "",
      message: "O job será removido e poderá ser recuperado na página de Recuperação.",
      onConfirm: async () => {
        setConfirmAction(null);
        // Optimistic: remove from list immediately
        setJobs(prev => prev.filter(j => j.id !== jobId));
        try {
          const deletedAt = new Date().toISOString();
          await base44.entities.DeleteLog.create({
            entity_type: "job",
            entity_id: jobId,
            entity_data: job,
            deleted_by: collab?.id || "unknown",
            deleted_by_name: collab?.name || "Desconhecido",
            deleted_at: deletedAt,
          });
          await base44.entities.Job.delete(jobId);
          // Add to deletedJobs for local display
          setDeletedJobs(prev => [{ ...job, _deletedAt: deletedAt, _deletedBy: collab?.name || "Desconhecido", _deleteLogId: jobId + "_del" }, ...prev]);
        } catch (err) {
          console.error("Erro ao excluir job:", err);
        }
      },
    });
  }

  function handleDeleteProject() {
    const collab = JSON.parse(sessionStorage.getItem("collaborator") || "{}");
    setConfirmAction({
      type: "deleteProject",
      title: "Excluir projeto?",
      itemName: projectData.name,
      message: "Todos os jobs serão salvos no log de exclusão e poderão ser recuperados. O projeto e tarefas serão excluídos permanentemente.",
      onConfirm: async () => {
        setConfirmAction(null);
        setArchiving(true);
        // Log all jobs to DeleteLog before deleting
        await Promise.all(jobs.map(j => base44.entities.DeleteLog.create({
          entity_type: "job",
          entity_id: j.id,
          entity_data: j,
          deleted_by: collab?.id || "unknown",
          deleted_by_name: collab?.name || "Desconhecido",
          deleted_at: new Date().toISOString(),
        })));
        await Promise.all(jobs.map(j => base44.entities.Job.delete(j.id)));
        await Promise.all(subtasks.map(s => base44.entities.Subtask.delete(s.id)));
        await base44.entities.Project.delete(project.id);
        setArchiving(false);
        onProjectUpdate && onProjectUpdate(null);
        onBack();
      },
    });
  }

  async function toggleObservation(obs) {
    // Update in schedule_data
    const proj = await base44.entities.Project.filter({ id: project.id }, "id", 1);
    const schedData = { ...(proj[0]?.schedule_data || {}) };
    const dayPosts = schedData[obs.date] || [];
    const idx = dayPosts.findIndex(p => p.id === obs.id);
    if (idx >= 0) {
      dayPosts[idx] = { ...dayPosts[idx], is_completed: !dayPosts[idx].is_completed };
      schedData[obs.date] = dayPosts;
      await base44.entities.Project.update(project.id, { schedule_data: schedData });
      setObservations(prev => prev.map(o => o.id === obs.id ? { ...o, is_completed: !o.is_completed } : o));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Back + header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Projetos
        </button>
        <span className="text-muted-foreground">/</span>
        {editingName ? (
          <div className="flex items-center gap-1.5">
            <input
              className="font-bold text-foreground text-sm border border-primary rounded px-2 py-0.5 focus:outline-none bg-background"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setEditingName(false); }}
              autoFocus
            />
            <button onClick={handleSaveName} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setEditingName(false); setNameValue(projectData.name); }} className="p-1 text-muted-foreground hover:bg-muted rounded"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group/name">
            <span className="font-bold text-foreground text-sm">{projectData.name}</span>
            <button onClick={() => setEditingName(true)} className="opacity-0 group-hover/name:opacity-100 p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all">
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">#{projectData.number}</span>
        <span className="text-xs text-muted-foreground ml-1">{projectData.client_name}</span>
        {parseFloat(totalHours) > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full ml-1">
            <Clock className="w-3 h-3" />
            {totalHours}h gastas
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Dropdown de equipes com seleção múltipla */}
          {allTeams.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors">
                  {projectTeams.length > 0 ? projectTeams.join(", ") : "Equipes"}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
                {allTeams.map(team => {
                  const active = projectTeams.includes(team);
                  return (
                    <DropdownMenuItem key={team} onClick={() => handleToggleTeam(team)} className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${active ? "bg-primary border-primary" : "border-border"}`}>
                        {active && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      {team}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowSchedule(true)} className="gap-1.5 h-8 text-xs">
            <Calendar className="w-3.5 h-3.5" /> Cronograma
          </Button>
          {isAdmin && (
            projectData.status === "archived" ? (
              <Button size="sm" variant="outline" onClick={handleUnarchive} disabled={archiving} className="gap-1.5 h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                <ArchiveRestore className="w-3.5 h-3.5" /> Desarquivar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleCompleteAndArchive} disabled={archiving} className="gap-1.5 h-8 text-xs border-green-300 text-green-700 hover:bg-green-50">
                <Archive className="w-3.5 h-3.5" /> Concluir & Arquivar
              </Button>
            )
          )}
          {isAdmin && (
            <Button size="sm" variant="destructive" onClick={handleDeleteProject} disabled={archiving} className="gap-1.5 h-8 text-xs">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Job
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-muted/40 border-b border-border flex-shrink-0">
        {overdueJobs.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-700 dark:text-red-400 text-xs font-semibold">
            <AlertCircle className="w-3.5 h-3.5" />
            {overdueJobs.length} em atraso
          </div>
        )}
        {notScheduledSoon.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-amber-700 text-xs font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" />
            {notScheduledSoon.length} não agendados (5 dias)
          </div>
        )}
        {isAdmin ? (
          <button
            onClick={() => setShowTimesheetModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-primary/40 text-foreground text-xs font-semibold hover:bg-primary/5 hover:border-primary transition-colors"
          >
            <Clock className="w-3.5 h-3.5 text-primary" />
            {totalHours}h gastas
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-foreground text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            {totalHours}h gastas
          </div>
        )}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
          isJobCountBelowContracted
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 text-red-600"
            : "bg-card border-border text-foreground"
        }`}>
          <Briefcase className={`w-3.5 h-3.5 ${isJobCountBelowContracted ? "text-red-500" : "text-muted-foreground"}`} />
          {activeJobsAll.length}{contractedDeliveries ? `/${contractedDeliveries}` : ""} jobs
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 text-green-700 text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {activeJobsAll.filter(j => j.status === "completed" || j.status === "scheduled").length} concluídos
        </div>
        {totalContracted > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-semibold flex-wrap">
            {[
              { label: "Card", count: jobContentCounts["feed_card"] || 0, contracted: client?.contracted_cards || 0, color: "#4ade80" },
              { label: "Reels", count: jobContentCounts["reels"] || 0, contracted: client?.contracted_reels || 0, color: "#60a5fa" },
              { label: "Promo", count: jobContentCounts["promocao"] || 0, contracted: client?.contracted_promocoes || 0, color: "#f87171" },
              { label: "VT", count: jobContentCounts["video"] || 0, contracted: client?.contracted_vt || 0, color: "#fb923c" },
              { label: "Foto", count: jobContentCounts["foto"] || 0, contracted: client?.contracted_foto || 0, color: "#fbbf24" },
              { label: "Stories", count: jobContentCounts["story"] || 0, contracted: client?.contracted_stories || 0, color: "#a78bfa" },
            ].filter(f => f.contracted > 0).map(f => (
              <span key={f.label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: f.color }} />
                <span className={f.count < f.contracted ? "text-red-600" : "text-foreground"}>{f.count}/{f.contracted}</span>
                <span className="text-muted-foreground">{f.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Jobs list */}
      <div className="flex-1 overflow-y-auto p-6">
        {jobs.length === 0 ? (
          <div className="text-center py-20">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
            <p className="text-muted-foreground font-medium">Nenhum job neste projeto</p>
            <Button className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" /> Criar primeiro job
            </Button>
          </div>
        ) : (() => {
          const sortByPostDate = (a, b) => {
            if (!a.post_date && !b.post_date) return 0;
            if (!a.post_date) return 1;
            if (!b.post_date) return -1;
            return a.post_date.localeCompare(b.post_date);
          };
          const activeJobs = jobs.filter(j => j.status !== "completed" && j.status !== "scheduled" && j.status !== "cancelled" && j.demand_type !== "interna").sort(sortByPostDate);
          const activeInternalJobs = jobs.filter(j => j.status !== "completed" && j.status !== "scheduled" && j.status !== "cancelled" && j.demand_type === "interna").sort(sortByPostDate);
          const completedJobs = jobs.filter(j => j.status === "completed" || j.status === "scheduled").sort(sortByPostDate);
          const cancelledJobsSorted = cancelledJobs.sort(sortByPostDate);

          const CONTENT_LABELS = {
            feed_card: "Card", reels: "Reels", story: "Story",
            video: "Vídeo", card_trafego: "Card Tráfego", video_trafego: "Vídeo Tráfego",
            trafego_pago: "Tráfego", foto: "Foto", promocao: "Promoção",
            email: "E-mail", blog: "Blog", outros: "Outros",
          };

          const renderJob = (j) => {
            const sc = STATUS_CONFIG[j.status] || STATUS_CONFIG.pending_briefing;
            const ContentIcon = CONTENT_ICONS[j.content_type] || Briefcase;
            const isLate = j.post_date && j.post_date < today && j.status !== "completed" && j.status !== "scheduled";
            const jobSubtasks = getSubtasksForJob(j.id);
            const completedSubs = jobSubtasks.filter(s => s.is_completed).length;
            const isCompleted = j.status === "completed";

            const statusDropdown = (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={e => e.stopPropagation()}
                    className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border justify-center ${sc.color} hover:opacity-80 transition-opacity`}
                  >
                    {sc.label}
                    <ChevronDown className="w-2.5 h-2.5 flex-shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                  {Object.entries(STATUS_CONFIG).filter(([key]) => key !== "cancelled").map(([key, val]) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={e => handleStatusChange(j.id, key, e)}
                      className={j.status === key ? "font-bold" : ""}
                    >
                      <span className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${val.dot}`} />
                      {val.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );

            return (
              <div key={j.id}>
                {/* Desktop row */}
                <div
                  onClick={() => handleSelectJob(j)}
                  className={`hidden md:grid cursor-pointer rounded-xl border transition-all hover:shadow-md ${
                    isCompleted
                      ? "border-border bg-muted/30 opacity-70 hover:opacity-100"
                      : isLate
                      ? "border-red-200 bg-red-50/30 dark:bg-red-900/10"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                  style={{ gridTemplateColumns: "2.5rem 2.5rem 1fr 8rem 7rem 13rem 2.5rem 2.5rem" }}
                >
                  <div className="flex items-center justify-center p-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isLate ? "bg-red-100" : "bg-muted"}`}>
                      <ContentIcon className={`w-3.5 h-3.5 ${isLate ? "text-red-500" : "text-muted-foreground"}`} />
                    </div>
                  </div>
                  <div className="flex items-center justify-center p-3">
                    <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{j.number || "—"}</span>
                  </div>
                  <div className="flex flex-col justify-center py-3 pr-3 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`font-semibold text-sm truncate ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>{j.title}</span>
                      {isLate && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{CONTENT_LABELS[j.content_type] || "Outros"}</span>
                      {jobSubtasks.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">· {completedSubs}/{jobSubtasks.length} tarefas</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-3 px-2">
                    {j.responsible_name ? (
                      <>
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold flex-shrink-0">
                          {j.responsible_name[0]?.toUpperCase()}
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate">{j.responsible_name.split(" ")[0]}</span>
                      </>
                    ) : <span className="text-[11px] text-muted-foreground/40">—</span>}
                  </div>
                  <div className="flex items-center justify-center py-3 px-2">
                    {j.post_date ? (
                      <div className={`flex items-center gap-1 text-xs font-semibold ${isLate ? "text-red-600" : "text-muted-foreground"}`}>
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {format(new Date(j.post_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      </div>
                    ) : <span className="text-[11px] text-muted-foreground/40">Sem data</span>}
                  </div>
                  <div className="flex items-center justify-center py-3 px-2 w-full">
                    {statusDropdown}
                  </div>
                  <div className="flex items-center justify-center py-3 px-1">
                    {minutesByJob[j.id] > 0 ? (
                      <span className="text-[10px] text-foreground font-semibold">
                        {(minutesByJob[j.id] / 60).toFixed(1)}h
                      </span>
                    ) : <span className="text-[10px] text-muted-foreground/30">—</span>}
                  </div>
                  <div className="flex items-center justify-center py-3 px-1">
                    {isAdmin && (
                      <button onClick={e => handleDeleteJob(j.id, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile card */}
                <div
                  onClick={() => handleSelectJob(j)}
                  className={`md:hidden cursor-pointer rounded-xl border p-3 transition-all ${
                    isCompleted
                      ? "border-border bg-muted/30 opacity-70"
                      : isLate
                      ? "border-red-200 bg-red-50/30 dark:bg-red-900/10"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isLate ? "bg-red-100" : "bg-muted"}`}>
                      <ContentIcon className={`w-4 h-4 ${isLate ? "text-red-500" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-semibold text-sm truncate ${isCompleted ? "line-through text-muted-foreground" : "text-foreground"}`}>{j.title}</span>
                            {isLate && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {j.number && <span className="text-[10px] font-mono text-muted-foreground">#{j.number}</span>}
                            <span className="text-[10px] text-muted-foreground">{CONTENT_LABELS[j.content_type] || "Outros"}</span>
                            {jobSubtasks.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{completedSubs}/{jobSubtasks.length} tarefas</span>
                            )}
                          </div>
                        </div>
                        <div onClick={e => e.stopPropagation()}>
                          {statusDropdown}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-3">
                          {j.responsible_name && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[9px] font-bold">
                                {j.responsible_name[0]?.toUpperCase()}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{j.responsible_name.split(" ")[0]}</span>
                            </div>
                          )}
                          {j.post_date && (
                            <div className={`flex items-center gap-1 text-[11px] font-medium ${isLate ? "text-red-600" : "text-muted-foreground"}`}>
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              {format(new Date(j.post_date + "T12:00:00"), "dd/MM", { locale: ptBR })}
                            </div>
                          )}
                          {j.logged_hours > 0 && (
                            <span className="text-[11px] text-muted-foreground">{j.logged_hours}h</span>
                          )}
                        </div>
                        {isAdmin && (
                          <button onClick={e => handleDeleteJob(j.id, e)} className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          };

          const openObs = observations.filter(o => !o.is_completed);
          const doneObs = observations.filter(o => o.is_completed);

          return (
            <div className="space-y-1.5">
              {/* Observations at the top */}
              {openObs.length > 0 && (
                <>
                  <div className="flex items-center gap-3 pb-2">
                    <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                      <StickyNote className="w-3.5 h-3.5" />
                      Observações ({openObs.length})
                    </span>
                    <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                  </div>
                  {openObs.map(obs => (
                    <div key={obs.id} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 p-3">
                      <button onClick={() => toggleObservation(obs)} className="w-6 h-6 rounded-full border-2 border-amber-400 flex items-center justify-center hover:bg-amber-100 transition-colors flex-shrink-0">
                        <span className="w-2 h-2" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{obs.text}</p>
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          {format(new Date(obs.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <StickyNote className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    </div>
                  ))}
                </>
              )}

              {/* Header row — desktop only */}
              <div
                className="hidden md:grid text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-0 mb-1"
                style={{ gridTemplateColumns: "2.5rem 2.5rem 1fr 8rem 7rem 13rem 2.5rem 2.5rem" }}
              >
                <div />
                <div className="text-center">#</div>
                <div className="pl-0">Job</div>
                <div>Responsável</div>
                <div className="text-center">Data Post</div>
                <div className="text-center">Status</div>
                <div className="text-center">Horas</div>
                <div />
              </div>

              {activeJobs.map(renderJob)}

              {activeInternalJobs.length > 0 && (
                <>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-blue-300 dark:bg-blue-700" />
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5" />
                      Demandas Internas ({activeInternalJobs.length})
                    </span>
                    <div className="flex-1 h-px bg-blue-300 dark:bg-blue-700" />
                  </div>
                  {activeInternalJobs.map(renderJob)}
                </>
              )}

              {(completedJobs.length > 0 || doneObs.length > 0) && (
                <>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      Concluídos ({completedJobs.length + doneObs.length})
                    </span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  {doneObs.map(obs => (
                    <div key={obs.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3 opacity-60 hover:opacity-100 transition-opacity">
                      <button onClick={() => toggleObservation(obs)} className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-white" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-muted-foreground line-through">{obs.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Obs · {format(new Date(obs.date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                      <StickyNote className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  ))}
                  {completedJobs.map(renderJob)}
                </>
              )}

              {cancelledJobsSorted.length > 0 && (
                <>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                    <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5" />
                      Cancelados ({cancelledJobsSorted.length})
                    </span>
                    <div className="flex-1 h-px bg-gray-300 dark:bg-gray-600" />
                  </div>
                  {cancelledJobsSorted.map(renderJob)}
                </>
              )}

              {isAdmin && deletedJobs.length > 0 && (
                <>
                  <div className="flex items-center gap-3 py-3">
                    <div className="flex-1 h-px bg-red-200 dark:bg-red-800" />
                    <span className="text-xs text-red-500 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluídos ({deletedJobs.length})
                    </span>
                    <div className="flex-1 h-px bg-red-200 dark:bg-red-800" />
                  </div>
                  {deletedJobs.map(dj => {
                    const sc = STATUS_CONFIG[dj.status] || STATUS_CONFIG.pending_briefing;
                    const ContentIcon = CONTENT_ICONS[dj.content_type] || Briefcase;
                    const CONTENT_LABELS = {
                      feed_card: "Card", reels: "Reels", story: "Story",
                      video: "Vídeo", card_trafego: "Card Tráfego", video_trafego: "Vídeo Tráfego",
                      trafego_pago: "Tráfego", foto: "Foto", promocao: "Promoção",
                      email: "E-mail", blog: "Blog", outros: "Outros",
                    };
                    return (
                      <div key={dj._deleteLogId || dj.id}
                        onClick={() => handleSelectJob(dj)}
                        className="hidden md:grid cursor-pointer rounded-xl border border-red-200 bg-red-50/30 dark:bg-red-900/10 opacity-70 hover:opacity-100 transition-all"
                        style={{ gridTemplateColumns: "2.5rem 2.5rem 1fr 8rem 7rem 13rem 2.5rem 2.5rem" }}
                      >
                        <div className="flex items-center justify-center p-3">
                          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                            <ContentIcon className="w-3.5 h-3.5 text-red-400" />
                          </div>
                        </div>
                        <div className="flex items-center justify-center p-3">
                          <span className="text-[10px] font-mono text-red-400 whitespace-nowrap">{dj.number || "—"}</span>
                        </div>
                        <div className="flex flex-col justify-center py-3 pr-3 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-sm truncate line-through text-red-500">{dj.title}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-red-400">{CONTENT_LABELS[dj.content_type] || "Outros"}</span>
                            {dj._deletedAt && (
                              <span className="text-[10px] text-red-400">· Excluído {format(new Date(dj._deletedAt), "dd/MM/yy", { locale: ptBR })}{dj._deletedBy ? ` por ${dj._deletedBy}` : ""}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 py-3 px-2">
                          {dj.responsible_name ? (
                            <span className="text-[11px] text-red-400 truncate">{dj.responsible_name.split(" ")[0]}</span>
                          ) : <span className="text-[11px] text-muted-foreground/30">—</span>}
                        </div>
                        <div className="flex items-center justify-center py-3 px-2">
                          {dj.post_date ? (
                            <span className="text-xs text-red-400">{format(new Date(dj.post_date + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
                          ) : <span className="text-[11px] text-muted-foreground/30">—</span>}
                        </div>
                        <div className="flex items-center justify-center py-3 px-2">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${sc.color} opacity-60`}>{sc.label}</span>
                        </div>
                        <div className="flex items-center justify-center py-3 px-1">
                          {minutesByJob[dj.id] > 0 ? (
                            <span className="text-[10px] text-red-400 font-semibold">{(minutesByJob[dj.id] / 60).toFixed(1)}h</span>
                          ) : <span className="text-[10px] text-muted-foreground/30">—</span>}
                        </div>
                        <div />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}
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
          onSubtasksChange={loadData}
        />,
        document.body
      )}

      {showSchedule && ReactDOM.createPortal(
        <ScheduleCalendar project={project} onClose={() => { setShowSchedule(false); loadData(); }} />,
        document.body
      )}

      {showTimesheetModal && (
        <ProjectTimesheetModal
          project={projectData}
          timesheets={timesheets}
          jobs={jobs}
          collaborators={collaborators}
          onClose={() => setShowTimesheetModal(false)}
          onRefresh={loadData}
        />
      )}

      <ConfirmDeleteModal
        title={confirmAction?.title || "Confirmar?"}
        itemName={confirmAction?.itemName || ""}
        itemSubtext={confirmAction?.itemSubtext}
        confirmLabel={confirmAction?.confirmLabel}
        confirmLoadingLabel={confirmAction?.confirmLoadingLabel}
        confirmVariant={confirmAction?.confirmVariant}
        message={confirmAction?.message || "Esta ação não pode ser desfeita."}
        isOpen={!!confirmAction}
        onConfirm={() => confirmAction?.onConfirm?.()}
        onCancel={() => setConfirmAction(null)}
      />

      {showCreate && (
        <CreateJobModal
          projectId={project.id}
          projectName={project.name}
          clientId={project.client_id}
          clientName={project.client_name}
          projectTeam={project.team}
          onClose={() => setShowCreate(false)}
          onCreate={async (newJob) => {
            setJobs(prev => [newJob, ...prev]);
            setShowCreate(false);
            // Buscar subtasks recém-criadas pelo template
            const newSubs = await base44.entities.Subtask.filter({ job_id: newJob.id }, "order", 50);
            if (newSubs.length > 0) {
              setSubtasks(prev => [...prev, ...newSubs]);
            }
          }}
        />
      )}
    </div>
  );
}