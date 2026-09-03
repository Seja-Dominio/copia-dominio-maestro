import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { format, subDays, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { nowManaus } from "@/lib/dateUtils";
import { Download, User, Briefcase, Clock, ArrowRightLeft, ChevronRight, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { generateDailyPDF, generateProductivityReportCSV } from "@/lib/dailyReportExport";

const STATUS_LABELS = {
  pending_briefing: "Pend. Briefing", pending_capture: "Pend. Captação",
  pending_design: "Pend. Designer", pending_edit: "Pend. Edição",
  internal_approval: "Aprov. Interna", client_approval: "Aprov. Cliente",
  scheduled: "Agendado", completed: "Concluído", cancelled: "Cancelado",
};

export default function ProductivityDailyReport({ period }) {
  const [jobs, setJobs] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [jobHistories, setJobHistories] = useState([]);
  const [userFilter, setUserFilter] = useState("all");
  const [expandedCollab, setExpandedCollab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const effectivePeriod = useMemo(() => {
    if (period?.start && period?.end) return period;
    const now = nowManaus();
    const end = format(subDays(now, 1), "yyyy-MM-dd");
    const start = format(subDays(now, 7), "yyyy-MM-dd");
    return { start, end };
  }, [period]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      base44.entities.Job.list("-created_date", 5000),
      base44.entities.Timesheet.list("-created_date", 5000),
      base44.entities.Collaborator.list("name", 100),
      base44.entities.JobHistory.list("-created_date", 10000),
    ]).then(([j, ts, c, h]) => {
      setJobs(j);
      setTimesheets(ts.filter(t => !t.is_running));
      setCollaborators(c);
      setJobHistories(h);
      setLoading(false);
    });
  }, []);

  const periodJobs = useMemo(() =>
    jobs.filter(j => j.created_date?.slice(0, 10) >= effectivePeriod.start && j.created_date?.slice(0, 10) <= effectivePeriod.end),
  [jobs, effectivePeriod]);

  const periodTs = useMemo(() =>
    timesheets.filter(t => t.started_at?.slice(0, 10) >= effectivePeriod.start && t.started_at?.slice(0, 10) <= effectivePeriod.end),
  [timesheets, effectivePeriod]);

  const periodHistories = useMemo(() =>
    jobHistories.filter(h => h.type === "change" && h.field === "status" && h.created_date?.slice(0, 10) >= effectivePeriod.start && h.created_date?.slice(0, 10) <= effectivePeriod.end),
  [jobHistories, effectivePeriod]);

  const collabSummaries = useMemo(() => {
    const activeCollabs = collaborators.filter(c => c.is_active);
    return activeCollabs.map(collab => {
      const created = periodJobs.filter(j => j.responsible_id === collab.id || j.created_by === collab.email);
      const ts = periodTs.filter(t => t.collaborator_id === collab.id);
      const totalMinutes = ts.reduce((s, t) => s + (t.duration_minutes || 0), 0);
      const changes = periodHistories.filter(h => h.collaborator_id === collab.id);
      const clientNames = [...new Set(ts.map(t => t.client_name).filter(Boolean))];
      const hasActivity = created.length > 0 || ts.length > 0 || changes.length > 0;
      return { collaborator: collab, jobsCreated: created, timesheets: ts, totalMinutes, statusChanges: changes, clientNames, hasActivity };
    }).filter(s => s.hasActivity).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [collaborators, periodJobs, periodTs, periodHistories]);

  const filtered = useMemo(() => {
    if (userFilter === "all") return collabSummaries;
    return collabSummaries.filter(s => s.collaborator.id === userFilter);
  }, [collabSummaries, userFilter]);

  const activeCollabs = useMemo(() =>
    collaborators.filter(c => c.is_active).sort((a, b) => a.name.localeCompare(b.name)),
  [collaborators]);

  const chartData = useMemo(() => {
    const start = parseISO(effectivePeriod.start);
    const end = parseISO(effectivePeriod.end);
    if (start > end) return [];
    const days = eachDayOfInterval({ start, end });
    return days.map(d => {
      const dStr = format(d, "yyyy-MM-dd");
      const label = format(d, "dd/MM");
      const created = periodJobs.filter(j => j.created_date?.startsWith(dStr)).length;
      const minutes = periodTs.filter(t => t.started_at?.startsWith(dStr)).reduce((s, t) => s + (t.duration_minutes || 0), 0);
      const changes = periodHistories.filter(h => h.created_date?.startsWith(dStr)).length;
      return { date: label, "Jobs Criados": created, "Horas": +(minutes / 60).toFixed(1), "Mudanças": changes };
    });
  }, [effectivePeriod, periodJobs, periodTs, periodHistories]);

  const totalJobs = filtered.reduce((s, c) => s + c.jobsCreated.length, 0);
  const totalMins = filtered.reduce((s, c) => s + c.totalMinutes, 0);
  const totalChanges = filtered.reduce((s, c) => s + c.statusChanges.length, 0);
  const totalClients = [...new Set(filtered.flatMap(c => c.clientNames))].length;

  function handleExportPDF(mode) {
    setExporting(true);
    try {
      const data = mode === "all" ? collabSummaries : filtered;
      const label = mode === "all" ? "Geral" : filtered[0]?.collaborator?.name || "usuario";
      generateDailyPDF(data, `${effectivePeriod.start}_${effectivePeriod.end}`, label);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedUserName = userFilter !== "all" ? activeCollabs.find(c => c.id === userFilter)?.name : null;

  return (
    <div className="space-y-6">
      {/* Filters & Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-muted-foreground" />
          <select
            className="h-8 rounded-md border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
          >
            <option value="all">Todos os colaboradores</option>
            {activeCollabs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {userFilter !== "all" && filtered.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleExportPDF("user")} disabled={exporting}>
              <Download className="w-3 h-3" /> {selectedUserName?.split(" ")[0]} (.pdf)
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleExportPDF("all")} disabled={exporting}>
            <Download className="w-3 h-3" /> Geral (.pdf)
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Briefcase className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-muted-foreground font-medium">Jobs Criados</span>
          </div>
          <p className="text-2xl font-black text-foreground">{totalJobs}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-green-600" />
            <span className="text-xs text-muted-foreground font-medium">Horas Trabalhadas</span>
          </div>
          <p className="text-2xl font-black text-foreground">{(totalMins / 60).toFixed(1)}h</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowRightLeft className="w-4 h-4 text-purple-600" />
            <span className="text-xs text-muted-foreground font-medium">Mudanças de Status</span>
          </div>
          <p className="text-2xl font-black text-foreground">{totalChanges}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-muted-foreground font-medium">Clientes Atendidos</span>
          </div>
          <p className="text-2xl font-black text-foreground">{totalClients}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">Atividade por Dia</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Jobs Criados" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Horas" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Mudanças" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Colaborador</th>
              <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Jobs</th>
              <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Horas</th>
              <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Mudanças</th>
              <th className="text-center px-3 py-3 font-semibold text-muted-foreground">Clientes</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <CollabTableRow
                key={s.collaborator.id}
                summary={s}
                isOpen={expandedCollab === s.collaborator.id}
                onToggle={() => setExpandedCollab(expandedCollab === s.collaborator.id ? null : s.collaborator.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted-foreground">Nenhuma atividade no período</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollabTableRow({ summary, isOpen, onToggle }) {
  const { collaborator: c, jobsCreated, timesheets, totalMinutes, statusChanges, clientNames } = summary;
  const hours = (totalMinutes / 60).toFixed(1);

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ backgroundColor: c.color || "hsl(var(--primary))" }}>
              {c.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <span className="font-semibold text-foreground">{c.name}</span>
              {c.role && <span className="text-muted-foreground ml-1">({c.role})</span>}
            </div>
          </div>
        </td>
        <td className="text-center px-3 py-3 font-semibold text-blue-700">{jobsCreated.length}</td>
        <td className="text-center px-3 py-3 font-semibold text-green-700">{hours}h</td>
        <td className="text-center px-3 py-3 font-semibold text-purple-700">{statusChanges.length}</td>
        <td className="text-center px-3 py-3">{clientNames.length}</td>
        <td className="px-2">
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={6} className="bg-muted/20 px-6 py-4">
            <div className="space-y-3 text-xs">
              {jobsCreated.length > 0 && (
                <div>
                  <p className="font-bold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Demandas Criadas</p>
                  {jobsCreated.map(j => (
                    <div key={j.id} className="flex gap-2 text-foreground py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <span>{j.title} {j.client_name && <span className="text-muted-foreground">— {j.client_name}</span>}</span>
                    </div>
                  ))}
                </div>
              )}
              {timesheets.length > 0 && (
                <div>
                  <p className="font-bold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Timesheets</p>
                  {timesheets.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-0.5">
                      <div className="flex gap-2 text-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                        <span>{t.job_title} {t.client_name && <span className="text-muted-foreground">— {t.client_name}</span>}</span>
                      </div>
                      <span className="text-muted-foreground font-mono">{Math.floor((t.duration_minutes || 0) / 60)}h{String((t.duration_minutes || 0) % 60).padStart(2, "0")}m</span>
                    </div>
                  ))}
                </div>
              )}
              {statusChanges.length > 0 && (
                <div>
                  <p className="font-bold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Mudanças de Status</p>
                  {statusChanges.map((h, i) => (
                    <div key={i} className="flex gap-2 text-foreground py-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                      <span>{h.text || `${STATUS_LABELS[h.old_value] || h.old_value} → ${STATUS_LABELS[h.new_value] || h.new_value}`}</span>
                    </div>
                  ))}
                </div>
              )}
              {clientNames.length > 0 && (
                <div>
                  <p className="font-bold text-muted-foreground uppercase tracking-wide text-[10px] mb-1">Clientes Atendidos</p>
                  <p className="text-foreground">{clientNames.join(", ")}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}