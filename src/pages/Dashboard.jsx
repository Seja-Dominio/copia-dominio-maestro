import { useState, useEffect, useMemo, useCallback } from "react";
import { createPageUrl } from "@/utils";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { base44 } from "@/api/base44Client";
import {
  Briefcase, AlertCircle, Users, AlertTriangle, XCircle, GripVertical, Lock, Unlock, EyeOff, Eye
} from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { nowManaus, todayStr as getTodayStr, currentMonthStr } from "@/lib/dateUtils";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";

import FinancialSection from "@/components/dashboard/FinancialSection";
import TimesheetMonitor from "@/components/dashboard/TimesheetMonitor";
import BirthdayWidget from "@/components/dashboard/BirthdayWidget";
import DashboardWidgetConfig, { getVisibleWidgets, getWidgetOrder, WIDGET_OPTIONS } from "@/components/dashboard/DashboardWidgetConfig";
import CollaboratorHoursModal from "@/components/dashboard/CollaboratorHoursModal";
import ContractExpiryWidget from "@/components/dashboard/ContractExpiryWidget";
import ProductivityCompiled from "@/components/dashboard/ProductivityCompiled";
import DailySummaryPanel from "@/components/dashboard/DailySummaryPanel";
import ClientKeyActivities from "@/components/agenda/ClientKeyActivities";

import StatCard from "@/components/dashboard/StatCard";
import AlertBanner from "@/components/dashboard/AlertBanner";
import NpsAlertPanel from "@/components/dashboard/NpsAlertPanel";
import TopClientsWidget from "@/components/dashboard/TopClientsWidget";
import OverdueJobsPanel from "@/components/dashboard/OverdueJobsPanel";
import NextPostsPanel from "@/components/dashboard/NextPostsPanel";
import MyOverduePanel from "@/components/dashboard/MyOverduePanel";
import JobDetailModal from "@/components/jobs/JobDetailModal";
import ClientAttentionWidget from "@/components/dashboard/ClientAttentionWidget";
import ScheduleTrustWidget from "@/components/dashboard/ScheduleTrustWidget";

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [entries, setEntries] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [clients, setClients] = useState([]);
  const [agendaEvents, setAgendaEvents] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollaborator, setSelectedCollaborator] = useState(null);
  const [overdueFilter, setOverdueFilter] = useState("all");
  const [visibleWidgets, setVisibleWidgets] = useState({});
  const [widgetOrder, setWidgetOrder] = useState([]);
  const [overdueTeamFilter, setOverdueTeamFilter] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [selectedJobSubtasks, setSelectedJobSubtasks] = useState([]);
  const [jobHistory, setJobHistory] = useState([]);

  const sessionCollaborator = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; }
  }, []);
  const isAdmin = sessionCollaborator?.access_level === "admin" || sessionCollaborator?.access_level === "master" || sessionCollaborator?.access_level === "gestor";

  const resolvedCollaborator = useMemo(() => {
    if (!sessionCollaborator?.id) return null;
    return collaborators.find(c => c.id === sessionCollaborator.id) || sessionCollaborator;
  }, [sessionCollaborator, collaborators]);

  useEffect(() => {
    if (resolvedCollaborator) {
      setVisibleWidgets(getVisibleWidgets(resolvedCollaborator));
      setWidgetOrder(getWidgetOrder(resolvedCollaborator));
    }
  }, [resolvedCollaborator]);

  const isWidgetVisible = (id) => visibleWidgets[id] !== false;

  const handleJobClick = useCallback(async (job) => {
    const jobSubtasks = subtasks.filter(s => s.job_id === job.id).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    setSelectedJob(job);
    setSelectedJobSubtasks(jobSubtasks);
  }, [subtasks]);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('getDashboardData', { collaborator_id: sessionCollaborator?.id });
      const d = res?.data || {};
      setProjects(Array.isArray(d.projects) ? d.projects : []);
      setJobs(Array.isArray(d.jobs) ? d.jobs : (d.jobs ? JSON.parse(d.jobs) : []));
      setEntries(Array.isArray(d.entries) ? d.entries : []);
      setCollaborators(Array.isArray(d.collaborators) ? d.collaborators : []);
      setTimesheets(Array.isArray(d.timesheets) ? d.timesheets : []);
      setClients(Array.isArray(d.clients) ? d.clients : []);
      setAgendaEvents(Array.isArray(d.agendaEvents) ? d.agendaEvents : []);
      setSubtasks(Array.isArray(d.subtasks) ? d.subtasks : (d.subtasks ? JSON.parse(d.subtasks) : []));
    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const { containerRef, handlers, PullIndicator } = usePullToRefresh(load);

  const today = nowManaus();
  const todayStr = getTodayStr();
  const in5DaysStr = format(addDays(today, 5), "yyyy-MM-dd");
  const currentMonth = currentMonthStr();

  // Financial KPIs
  const thisMonthEntries = entries.filter(e => {
    const date = e.competence_date || e.due_date || e.payment_date;
    return date && date.startsWith(currentMonth);
  });
  const totalRevenue = thisMonthEntries.filter(e => e.type === "revenue" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpense = thisMonthEntries.filter(e => e.type === "expense" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
  const profitability = totalRevenue > 0 ? ((totalRevenue - totalExpense) / totalRevenue * 100).toFixed(1) : 0;

  const monthlyRevenueForecast = entries.filter(e => {
    if (e.type !== "revenue" || !["paid", "pending", "forecast"].includes(e.status)) return false;
    const dateStr = e.due_date || e.competence_date || e.billing_date;
    if (!dateStr) return false;
    const d = parseISO(dateStr);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
  }).reduce((s, e) => s + (e.amount || 0), 0);

  const timesheetByCollab = useMemo(() => {
    const tsList = Array.isArray(timesheets) ? timesheets : [];
    return collaborators.map(c => {
      const mins = tsList.filter(t => t.collaborator_id === c.id).reduce((s, t) => {
        if (t.is_running && t.started_at) return s + Math.floor((Date.now() - new Date(t.started_at).getTime()) / 60000);
        return s + (t.duration_minutes || 0);
      }, 0);
      return { ...c, total_minutes: mins, total_hours: (mins / 60).toFixed(1) };
    }).filter(c => c.total_minutes > 0).sort((a, b) => b.total_minutes - a.total_minutes);
  }, [collaborators, timesheets]);

  const topClients = useMemo(() => {
    const activeIds = new Set(clients.filter(c => c.status === "active").map(c => c.id));
    const clientMap = {};
    const tsList = Array.isArray(timesheets) ? timesheets : [];
    tsList.forEach(t => {
      if (!t.client_id || !activeIds.has(t.client_id)) return;
      const d = t.started_at ? new Date(t.started_at) : null;
      if (!d || d.getFullYear() !== today.getFullYear() || d.getMonth() !== today.getMonth()) return;
      if (!clientMap[t.client_id]) clientMap[t.client_id] = { name: t.client_name, minutes: 0, cost: 0 };
      const mins = t.duration_minutes || 0;
      clientMap[t.client_id].minutes += mins;
      const collab = collaborators.find(c => c.id === t.collaborator_id);
      clientMap[t.client_id].cost += (mins / 60) * (collab?.hourly_rate || 0);
    });
    return Object.values(clientMap).sort((a, b) => b.minutes - a.minutes).slice(0, 10).map(c => ({ ...c, hours: (c.minutes / 60).toFixed(1) }));
  }, [timesheets, collaborators, clients, today]);

  // ── Excluded project IDs (completed/archived) ──
  const excludedProjectIds = useMemo(() => {
    return new Set(projects.filter(p => p.status === "completed" || p.status === "archived").map(p => p.id));
  }, [projects]);

  // ── Clients at risk ──
  const clientsAtRisk = useMemo(() => {
    if (!isAdmin) return [];
    const todayDate = getTodayStr();
    const finishedJobStatuses = ["completed", "scheduled", "cancelled"];

    // Only consider jobs that are not finished AND not from completed/archived projects
    const relevantJobs = jobs.filter(j => {
      if (finishedJobStatuses.includes(j.status)) return false;
      if (j.project_id && excludedProjectIds.has(j.project_id)) return false;
      return true;
    });

    // Group relevant jobs by client
    const clientJobsMap = {};
    relevantJobs.forEach(j => {
      if (!j.client_id) return;
      if (!clientJobsMap[j.client_id]) clientJobsMap[j.client_id] = [];
      clientJobsMap[j.client_id].push(j);
    });

    // Group subtasks by job (only for relevant jobs)
    const relevantJobIds = new Set(relevantJobs.map(j => j.id));
    const subtasksByJob = {};
    subtasks.forEach(s => {
      if (!s.job_id || !relevantJobIds.has(s.job_id)) return;
      if (!subtasksByJob[s.job_id]) subtasksByJob[s.job_id] = [];
      subtasksByJob[s.job_id].push(s);
    });

    // Future captacao events by client
    const futureCaptacaoByClient = {};
    agendaEvents.forEach(ev => {
      if (!ev.client_id) return;
      if (!["captacao", "captacao_imagens"].includes(ev.activity_type)) return;
      if (ev.date && ev.date >= todayDate) {
        futureCaptacaoByClient[ev.client_id] = true;
      }
    });

    const normalize = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const results = [];
    clients.forEach(client => {
      const cJobs = clientJobsMap[client.id] || [];
      let overdueJobsCount = 0;
      let overdueSubtasksCount = 0;
      let hasCaptacaoPending = false;

      cJobs.forEach(j => {
        if (j.post_date && j.post_date <= todayDate) {
          overdueJobsCount++;
        }
        const jSubs = subtasksByJob[j.id] || [];
        jSubs.forEach(s => {
          if (!s.is_completed && s.deadline && s.deadline <= todayDate) overdueSubtasksCount++;
          if (!s.is_completed && normalize(s.title).includes("captacao")) hasCaptacaoPending = true;
        });
      });

      const captacaoPendingSemAgenda = hasCaptacaoPending && !futureCaptacaoByClient[client.id];

      if (overdueJobsCount > 0 || overdueSubtasksCount > 0 || captacaoPendingSemAgenda) {
        results.push({
          client_id: client.id,
          name: client.name,
          overdueJobsCount,
          overdueSubtasksCount,
          captacaoPendingSemAgenda,
        });
      }
    });

    return results.sort((a, b) => (b.overdueJobsCount + b.overdueSubtasksCount + (b.captacaoPendingSemAgenda ? 5 : 0)) - (a.overdueJobsCount + a.overdueSubtasksCount + (a.captacaoPendingSemAgenda ? 5 : 0)));
  }, [isAdmin, jobs, subtasks, agendaEvents, clients, excludedProjectIds]);

  const myCollabId = resolvedCollaborator?.id;

  const mySubtasks = useMemo(() => {
    if (!myCollabId) return [];
    return subtasks.filter(s => s.responsible_id === myCollabId);
  }, [subtasks, myCollabId]);

  const myJobs = useMemo(() => {
    if (!myCollabId) return [];
    const ids = new Set(mySubtasks.map(s => s.job_id).filter(Boolean));
    return jobs.filter(j => j.responsible_id === myCollabId || ids.has(j.id));
  }, [jobs, mySubtasks, myCollabId]);

  const myOverdueJobs = useMemo(() => {
    if (!myCollabId) return [];
    const overdueByPost = myJobs.filter(j => j.post_date && j.post_date <= todayStr && !["completed", "scheduled", "cancelled"].includes(j.status));
    const subtaskJobIds = new Set(mySubtasks.filter(s => !s.is_completed && s.deadline && s.deadline <= todayStr).map(s => s.job_id).filter(Boolean));
    const overdueBySubtask = jobs.filter(j => subtaskJobIds.has(j.id) && !["completed", "scheduled", "cancelled"].includes(j.status));
    const allIds = new Set([...overdueByPost.map(j => j.id), ...overdueBySubtask.map(j => j.id)]);
    const jobMap = new Map(jobs.map(j => [j.id, j]));
    return Array.from(allIds).map(id => jobMap.get(id)).filter(Boolean).sort((a, b) => (a.post_date || "9999").localeCompare(b.post_date || "9999"));
  }, [myJobs, mySubtasks, jobs, myCollabId, todayStr]);

  const myNext5NotScheduled = useMemo(() =>
    myJobs.filter(j => j.post_date && j.post_date >= todayStr && j.post_date <= in5DaysStr && !["scheduled", "completed", "cancelled"].includes(j.status))
      .sort((a, b) => (a.post_date || "").localeCompare(b.post_date || ""))
  , [myJobs, todayStr, in5DaysStr]);

  const allOverdueJobs = useMemo(() => {
    if (!isAdmin) return myOverdueJobs;
    const jobMap = new Map(jobs.map(j => [j.id, j]));
    const ids = new Set();
    jobs.forEach(j => {
      if (["completed", "scheduled", "cancelled"].includes(j.status)) return;
      if (j.project_id && excludedProjectIds.has(j.project_id)) return;
      if (j.post_date && j.post_date <= todayStr) ids.add(j.id);
    });
    subtasks.forEach(s => {
      if (!s.is_completed && s.deadline && s.deadline <= todayStr && s.job_id) {
        const j = jobMap.get(s.job_id);
        if (!j || ["completed", "scheduled", "cancelled"].includes(j.status)) return;
        if (j.project_id && excludedProjectIds.has(j.project_id)) return;
        ids.add(s.job_id);
      }
    });
    return Array.from(ids).map(id => jobMap.get(id)).filter(Boolean).sort((a, b) => (a.post_date || "9999").localeCompare(b.post_date || "9999"));
  }, [jobs, myOverdueJobs, isAdmin, todayStr, subtasks, excludedProjectIds]);

  const [allTeams, setAllTeams] = useState([]);
  useEffect(() => {
    base44.entities.Squad.filter({ is_active: true }, "name", 100).then(squads => {
      setAllTeams(squads.map(s => s.name).sort());
    });
    if (isAdmin) {
      base44.entities.JobHistory.filter({ type: "change" }, "-created_date", 1000)
        .then(h => setJobHistory(h)).catch(() => {});
    }
  }, [isAdmin]);

  const scheduleBreaches = useMemo(() => {
    // Only clients that have at least one active project (not completed/archived)
    const activeClientIds = new Set(
      projects.filter(p => p.status !== "completed" && p.status !== "archived").map(p => p.client_id).filter(Boolean)
    );
    const clientMap = {};
    clients.forEach(c => { clientMap[c.id] = c.name; });

    // Date changes — from jobHistory (each history entry = one move, same job can appear multiple times)
    const dateChangesByClient = {};
    const dateChangeJobs = {};
    jobHistory.filter(h => h.field === "post_date").forEach(h => {
      const job = jobs.find(j => j.id === h.job_id);
      if (!job?.client_id || !activeClientIds.has(job.client_id)) return;
      if (!dateChangesByClient[job.client_id]) dateChangesByClient[job.client_id] = 0;
      dateChangesByClient[job.client_id]++;
      if (!dateChangeJobs[job.client_id]) dateChangeJobs[job.client_id] = [];
      dateChangeJobs[job.client_id].push({
        id: job.id, title: job.title,
        old_value: h.old_value, new_value: h.new_value, user: h.user,
      });
    });

    // Cancelled jobs — find who cancelled from jobHistory
    const cancelledByClient = {};
    const cancelledJobsList = {};
    jobs.filter(j => j.status === "cancelled" && j.client_id && activeClientIds.has(j.client_id)).forEach(j => {
      if (!cancelledByClient[j.client_id]) cancelledByClient[j.client_id] = 0;
      cancelledByClient[j.client_id]++;
      if (!cancelledJobsList[j.client_id]) cancelledJobsList[j.client_id] = [];
      const cancelEvent = jobHistory.find(h => h.job_id === j.id && h.field === "status" && h.new_value === "cancelled");
      cancelledJobsList[j.client_id].push({ id: j.id, title: j.title, post_date: j.post_date, user: cancelEvent?.user || "" });
    });

    const allIds = new Set([...Object.keys(dateChangesByClient), ...Object.keys(cancelledByClient)]);
    const results = [];
    allIds.forEach(cid => {
      const changes = dateChangesByClient[cid] || 0;
      const cancelled = cancelledByClient[cid] || 0;
      if (changes > 0 || cancelled > 0) results.push({
        client_id: cid, name: clientMap[cid] || "Cliente", dateChanges: changes, cancelled,
        dateChangeJobs: dateChangeJobs[cid] || [], cancelledJobs: cancelledJobsList[cid] || [],
      });
    });
    return results;
  }, [jobHistory, jobs, clients, projects]);

  const projectTeamsMap = useMemo(() => {
    const map = {};
    projects.forEach(p => { map[p.id] = p.teams?.length ? p.teams : p.team ? [p.team] : []; });
    return map;
  }, [projects]);

  // Map: jobId → Set of collaborator IDs with overdue subtasks on that job
  const overdueSubtaskOwnersByJob = useMemo(() => {
    const map = {};
    subtasks.forEach(s => {
      if (!s.is_completed && s.deadline && s.deadline <= todayStr && s.job_id && s.responsible_id) {
        if (!map[s.job_id]) map[s.job_id] = new Set();
        map[s.job_id].add(s.responsible_id);
      }
    });
    return map;
  }, [subtasks, todayStr]);

  // Combined list: overdue + next 5 days not scheduled (for the panel sections)
  const overdueJobs = useMemo(() => {
    const overdueIds = new Set(allOverdueJobs.map(j => j.id));
    const next5NotSched = (isAdmin ? jobs : myJobs).filter(j =>
      j.post_date && j.post_date > todayStr && j.post_date <= in5DaysStr &&
      !["scheduled", "completed", "cancelled"].includes(j.status) &&
      !overdueIds.has(j.id)
    );
    let combined = [...allOverdueJobs, ...next5NotSched];
    if (overdueFilter !== "all") {
      combined = combined.filter(j =>
        j.responsible_id === overdueFilter ||
        (overdueSubtaskOwnersByJob[j.id] && overdueSubtaskOwnersByJob[j.id].has(overdueFilter))
      );
    }
    if (overdueTeamFilter !== "all") {
      combined = overdueTeamFilter === "none"
        ? combined.filter(j => !j.project_id || !(projectTeamsMap[j.project_id] || []).length)
        : combined.filter(j => (projectTeamsMap[j.project_id] || []).includes(overdueTeamFilter));
    }
    return combined;
  }, [allOverdueJobs, jobs, myJobs, isAdmin, overdueFilter, overdueTeamFilter, projectTeamsMap, todayStr, in5DaysStr, overdueSubtaskOwnersByJob]);

  const next5Jobs = useMemo(() => {
    const source = isAdmin ? jobs : myJobs;
    return source.filter(j => j.post_date && j.post_date >= todayStr && j.post_date <= in5DaysStr).sort((a, b) => (a.post_date || "").localeCompare(b.post_date || ""));
  }, [jobs, myJobs, isAdmin, todayStr, in5DaysStr]);

  const notScheduledNext5 = next5Jobs.filter(j => !["scheduled", "completed", "cancelled"].includes(j.status));
  const scheduledNext5 = next5Jobs.filter(j => j.status === "scheduled");

  const postageJobs = isAdmin ? jobs : myJobs;
  const dayGroups = useMemo(() => {
    const groups = [];
    for (let i = 0; i <= 5; i++) {
      const d = addDays(today, i);
      const dStr = format(d, "yyyy-MM-dd");
      const dJobs = postageJobs.filter(j => j.post_date === dStr && j.status !== "cancelled");
      if (dJobs.length > 0) groups.push({ date: d, dateStr: dStr, jobs: dJobs });
    }
    return groups;
  }, [postageJobs, today]);

  // ── Widget Registry ──
  const widgetRegistry = useMemo(() => ({
    my_alerts: {
      render: () => myCollabId ? (
        <div className="flex flex-wrap gap-3">
          <AlertBanner count={myOverdueJobs.length} label={`entrega${myOverdueJobs.length !== 1 ? "s" : ""} atrasada${myOverdueJobs.length !== 1 ? "s" : ""} (meus)`} color={myOverdueJobs.length > 0 ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800" : "border-border bg-muted/40 text-muted-foreground"} icon={XCircle} />
          <AlertBanner count={myNext5NotScheduled.length} label={`postage${myNext5NotScheduled.length !== 1 ? "ns" : "m"} nos próximos 5 dias não agendada${myNext5NotScheduled.length !== 1 ? "s" : ""}`} color={myNext5NotScheduled.length > 0 ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800" : "border-border bg-muted/40 text-muted-foreground"} icon={AlertTriangle} />
        </div>
      ) : null,
      adminOnly: false,
    },
    my_overdue: {
      render: () => myCollabId ? <MyOverduePanel myOverdueJobs={myOverdueJobs} onJobClick={handleJobClick} /> : null,
      adminOnly: false,
    },
    kpi_cards: {
      render: () => (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          <StatCard title="Clientes Ativos" value={clients.length} sub={`${clients.filter(c => c.tier === "elite").length} elite`} icon={Users} color="bg-primary" href={createPageUrl("ClientPortfolio")} />
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = createPageUrl("Jobs")}>
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 ${allOverdueJobs.length > 0 ? "bg-destructive" : "bg-green-500"} rounded-xl flex items-center justify-center`}>
                <AlertCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Atrasados</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-black text-foreground">{overdueJobs.filter(j => j.post_date && j.post_date <= todayStr && !["completed","scheduled","cancelled"].includes(j.status)).length}</p>
                  <span className="text-[10px] text-muted-foreground font-medium">jobs</span>
                  <span className="text-muted-foreground">|</span>
                  <p className="text-2xl font-black text-foreground">{(() => { const postIds = new Set(overdueJobs.filter(j => j.post_date && j.post_date <= todayStr && !["completed","scheduled","cancelled"].includes(j.status)).map(j => j.id)); return overdueJobs.filter(j => !postIds.has(j.id) && !["completed","scheduled","cancelled"].includes(j.status)).length; })()}</p>
                  <span className="text-[10px] text-muted-foreground font-medium">tarefas</span>
                </div>
              </div>
            </div>
            {isAdmin && (
              <select className="w-full h-7 mt-2 rounded-lg border border-input bg-background px-2 text-xs" value={overdueFilter} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); setOverdueFilter(e.target.value); }}>
                <option value="all">Toda equipe</option>
                {collaborators.filter(c => c.is_active !== false).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <StatCard title="NPS Médio" value={clients.length > 0 ? Math.round(clients.reduce((s, c) => s + (c.nps_score ?? 100), 0) / clients.length) : "—"} sub="média dos clientes" icon={Users} color={clients.length > 0 && (clients.reduce((s,c)=>s+(c.nps_score??100),0)/clients.length) >= 90 ? "bg-emerald-500" : (clients.reduce((s,c)=>s+(c.nps_score??100),0)/clients.length) >= 70 ? "bg-amber-500" : "bg-destructive"} href={createPageUrl("ClientPortfolio")} />
        </div>
      ),
      adminOnly: false,
    },
    alert_banners_team: {
      render: () => {
        const postOverdue = overdueJobs.filter(j => j.post_date && j.post_date <= todayStr && !["completed","scheduled","cancelled"].includes(j.status));
        const subtaskOverdueIds = new Set(subtasks.filter(s => !s.is_completed && s.deadline && s.deadline <= todayStr).map(s => s.job_id).filter(Boolean));
        const postOverdueIds = new Set(postOverdue.map(j => j.id));
        const taskOverdue = overdueJobs.filter(j => !postOverdueIds.has(j.id) && subtaskOverdueIds.has(j.id) && !["completed","scheduled","cancelled"].includes(j.status));
        const next5NS = overdueJobs.filter(j => j.post_date && j.post_date > todayStr && j.post_date <= in5DaysStr && !["scheduled","completed","cancelled"].includes(j.status));
        return (
          <div className="flex flex-wrap gap-3">
            <AlertBanner count={postOverdue.length} label={`post${postOverdue.length !== 1 ? "s" : ""} com data atrasada`} color={postOverdue.length > 0 ? "border-red-200 bg-red-50 text-red-700 dark:bg-red-900/20 dark:border-red-800" : "border-border bg-muted/40 text-muted-foreground"} icon={XCircle} />
            <AlertBanner count={taskOverdue.length} label={`post${taskOverdue.length !== 1 ? "s" : ""} com tarefa${taskOverdue.length !== 1 ? "s" : ""} atrasada${taskOverdue.length !== 1 ? "s" : ""}`} color={taskOverdue.length > 0 ? "border-orange-200 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:border-orange-800" : "border-border bg-muted/40 text-muted-foreground"} icon={AlertTriangle} />
            <AlertBanner count={next5NS.length} label={`post${next5NS.length !== 1 ? "s" : ""} próx. 5 dias não agendado${next5NS.length !== 1 ? "s" : ""}`} color={next5NS.length > 0 ? "border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800" : "border-border bg-muted/40 text-muted-foreground"} icon={AlertTriangle} />
          </div>
        );
      },
      adminOnly: true,
    },
    financial_section: {
      render: () => (
        <FinancialSection
          totalRevenue={totalRevenue}
          totalExpense={totalExpense}
          profitability={profitability}
          monthlyRevenueForecast={monthlyRevenueForecast}
          entries={entries}
        />
      ),
      adminOnly: true,
      masterOnly: true,
    },
    next_posts: {
      render: () => <NextPostsPanel dayGroups={dayGroups} scheduledCount={scheduledNext5.length} notScheduledCount={notScheduledNext5.length} todayStr={todayStr} onJobClick={handleJobClick} />,
      adminOnly: false,
    },
    overdue_jobs_team: {
      render: () => <OverdueJobsPanel overdueJobs={overdueJobs} allTeams={allTeams} overdueTeamFilter={overdueTeamFilter} onTeamFilterChange={setOverdueTeamFilter} subtasks={subtasks} todayStr={todayStr} in5DaysStr={in5DaysStr} onJobClick={handleJobClick} />,
      adminOnly: true,
    },
    nps_panel: {
      render: () => <NpsAlertPanel clients={clients} />,
      adminOnly: false,
    },
    contract_expiry: {
      render: () => <ContractExpiryWidget entries={entries} clients={clients} />,
      adminOnly: false,
    },
    birthdays: {
      render: () => <BirthdayWidget clients={clients} collaborators={collaborators} />,
      adminOnly: false,
    },
    top_clients: {
      render: () => <TopClientsWidget topClients={topClients} />,
      adminOnly: false,
    },
    client_activities: {
      render: () => <ClientKeyActivities monthEvents={agendaEvents.filter(ev => ev.date?.startsWith(currentMonth))} clients={clients} />,
      adminOnly: true,
    },
    timesheet_monitor: {
      render: () => <TimesheetMonitor collaborators={collaborators} />,
      adminOnly: true,
    },
    productivity: {
      render: () => <ProductivityCompiled timesheetByCollab={timesheetByCollab} resolvedCollaborator={resolvedCollaborator} />,
      adminOnly: false,
    },
    daily_summary: {
      render: () => <DailySummaryPanel jobs={jobs} timesheets={timesheets} collaborators={collaborators} subtasks={subtasks} projects={projects} />,
      adminOnly: true,
    },
    client_attention: {
      render: () => <ClientAttentionWidget clientsAtRisk={clientsAtRisk} scheduleBreaches={scheduleBreaches} />,
      adminOnly: true,
    },
    schedule_trust: {
      render: () => <ScheduleTrustWidget scheduleBreaches={scheduleBreaches} />,
      adminOnly: true,
    },
  }), [myCollabId, myOverdueJobs, myNext5NotScheduled, clients, allOverdueJobs, overdueJobs, overdueFilter, collaborators, isAdmin, totalRevenue, totalExpense, profitability, monthlyRevenueForecast, entries, dayGroups, scheduledNext5, notScheduledNext5, todayStr, allTeams, overdueTeamFilter, topClients, agendaEvents, currentMonth, timesheetByCollab, resolvedCollaborator, clientsAtRisk, scheduleBreaches]);

  const isMasterUser = sessionCollaborator?.access_level === "admin" || sessionCollaborator?.access_level === "master";

  // ── Visible ordered widgets ──
  const visibleOrderedWidgets = useMemo(() => {
    return widgetOrder.filter(id => {
      if (visibleWidgets[id] === false) return false;
      const w = widgetRegistry[id];
      if (!w) return false;
      if (w.adminOnly && !isAdmin) return false;
      if (w.masterOnly && !isMasterUser) return false;
      return true;
    });
  }, [widgetOrder, visibleWidgets, widgetRegistry, isAdmin, isMasterUser]);

  // ── Drag handler ──
  const handleDragEnd = useCallback(async (result) => {
    if (!result.destination) return;
    const items = [...visibleOrderedWidgets];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    // Reconstruct full order: visible in new order + hidden
    const hiddenItems = widgetOrder.filter(id => !items.includes(id));
    const newOrder = [...items, ...hiddenItems];
    setWidgetOrder(newOrder);
    // Persist
    if (resolvedCollaborator?.id) {
      await base44.entities.Collaborator.update(resolvedCollaborator.id, { dashboard_layout: newOrder });
      const session = sessionStorage.getItem("collaborator");
      if (session) {
        const collab = JSON.parse(session);
        collab.dashboard_layout = newOrder;
        sessionStorage.setItem("collaborator", JSON.stringify(collab));
      }
    }
  }, [visibleOrderedWidgets, widgetOrder, resolvedCollaborator]);

  // ── Config save handler ──
  const handleConfigSave = useCallback((newWidgets, newOrder) => {
    setVisibleWidgets(newWidgets);
    setWidgetOrder(newOrder);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Carregando dashboard...</span>
        </div>
      </div>
    );
  }

  const widgetLabel = (id) => WIDGET_OPTIONS.find(w => w.id === id)?.label || id;

  return (
    <div ref={containerRef} data-main-scroll className="p-6 max-w-[1600px] mx-auto space-y-6 overflow-auto" style={{ WebkitOverflowScrolling: "touch" }} {...handlers}>
      <PullIndicator />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Olá, {resolvedCollaborator?.name?.split(" ")[0] || sessionCollaborator?.name?.split(" ")[0] || "Bem-vindo"} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 capitalize">
            {format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && resolvedCollaborator?.id && (
            <>
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                onClick={() => setEditMode(v => !v)}
                className="gap-2 h-8 text-xs"
              >
                {editMode ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {editMode ? "Concluir" : "Reorganizar"}
              </Button>
              <DashboardWidgetConfig
                collaboratorId={resolvedCollaborator.id}
                currentWidgets={visibleWidgets}
                currentOrder={widgetOrder}
                onSave={handleConfigSave}
              />
            </>
          )}

          <a href={createPageUrl("Jobs")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors no-underline">
            <Briefcase className="w-4 h-4" /> Ver Pauta
          </a>
        </div>
      </div>

      {editMode && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-primary font-medium">
          <GripVertical className="w-4 h-4" />
          Arraste os widgets para reorganizar o seu dashboard. Clique em "Concluir" quando terminar.
        </div>
      )}

      {/* Draggable widgets */}
      {editMode ? (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="dashboard-main">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
                {visibleOrderedWidgets.map((id, index) => {
                  const w = widgetRegistry[id];
                  if (!w) return null;
                  const content = w.render();
                  if (!content) return null;
                  return (
                    <Draggable key={id} draggableId={id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`relative group ${snapshot.isDragging ? "shadow-2xl opacity-95 z-50 scale-[1.01]" : ""} transition-shadow`}
                        >
                          {/* Drag handle bar */}
                          <div
                            {...provided.dragHandleProps}
                            className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-card border border-border rounded-full px-3 py-1 shadow-md cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground font-semibold">{widgetLabel(id)}</span>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                const newWidgets = { ...visibleWidgets, [id]: false };
                                setVisibleWidgets(newWidgets);
                                if (resolvedCollaborator?.id) {
                                  await base44.entities.Collaborator.update(resolvedCollaborator.id, { dashboard_widgets: newWidgets });
                                  const session = sessionStorage.getItem("collaborator");
                                  if (session) { const c = JSON.parse(session); c.dashboard_widgets = newWidgets; sessionStorage.setItem("collaborator", JSON.stringify(c)); }
                                }
                              }}
                              className="ml-1 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors no-touch-min"
                              style={{ minHeight: "unset", minWidth: "unset" }}
                              title="Não ver este quadro"
                            >
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="border-2 border-dashed border-primary/20 rounded-2xl">
                            {content}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="space-y-4">
          {visibleOrderedWidgets.map(id => {
            const w = widgetRegistry[id];
            if (!w) return null;
            const content = w.render();
            if (!content) return null;
            return <div key={id}>{content}</div>;
          })}
        </div>
      )}

      {/* Hidden widgets section */}
      {(() => {
        const hiddenWidgets = widgetOrder.filter(id => {
          if (visibleWidgets[id] !== false) return false;
          const w = widgetRegistry[id];
          if (!w) return false;
          if (w.adminOnly && !isAdmin) return false;
          if (w.masterOnly && !isMasterUser) return false;
          return true;
        });
        if (hiddenWidgets.length === 0) return null;
        return (
          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <EyeOff className="w-4 h-4" /> Quadros ocultos ({hiddenWidgets.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {hiddenWidgets.map(id => (
                <button
                  key={id}
                  onClick={async () => {
                    const newWidgets = { ...visibleWidgets, [id]: true };
                    setVisibleWidgets(newWidgets);
                    if (resolvedCollaborator?.id) {
                      await base44.entities.Collaborator.update(resolvedCollaborator.id, { dashboard_widgets: newWidgets });
                      const session = sessionStorage.getItem("collaborator");
                      if (session) { const c = JSON.parse(session); c.dashboard_widgets = newWidgets; sessionStorage.setItem("collaborator", JSON.stringify(c)); }
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-3 bg-muted/50 border border-dashed border-border rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {widgetLabel(id)}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {selectedCollaborator && (
        <CollaboratorHoursModal collaborator={selectedCollaborator} timesheets={timesheets} onClose={() => setSelectedCollaborator(null)} onUpdate={() => base44.entities.Timesheet.list("-created_date", 500).then(ts => setTimesheets(ts))} />
      )}

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          subtasks={selectedJobSubtasks}
          onClose={() => { setSelectedJob(null); setSelectedJobSubtasks([]); }}
          onUpdate={(updatedJob) => {
            setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
            setSelectedJob(updatedJob);
          }}
          onSubtasksChange={() => {
            base44.entities.Subtask.filter({ job_id: selectedJob.id }, "order", 100).then(subs => setSelectedJobSubtasks(subs));
          }}
        />
      )}
    </div>
  );
}