import { useMemo, useState } from "react";
import { Clock, DollarSign, Users, RotateCcw, Briefcase, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import TimesheetEditModal from "@/components/timesheets/TimesheetEditModal";

function fmtH(mins) {
  const h = Math.floor((mins || 0) / 60);
  const m = (mins || 0) % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}
function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function TimesheetFullReport({ timesheets, collaborators, onRefresh, isAdmin }) {
  const [expandedClients, setExpandedClients] = useState({});
  const [editingTs, setEditingTs] = useState(null);

  const data = useMemo(() => {
    const clientMap = {};

    timesheets.forEach(t => {
      if (!t.client_id) return;
      if (!clientMap[t.client_id]) {
        clientMap[t.client_id] = {
          id: t.client_id,
          name: t.client_name || "—",
          totalMins: 0,
          reworkMins: 0,
          totalCost: 0,
          jobs: {},
          involved: new Set(),
        };
      }
      const c = clientMap[t.client_id];
      const collab = collaborators.find(col => col.id === t.collaborator_id);
      const rate = collab?.hourly_rate || 0;
      const mins = t.duration_minutes || 0;
      const cost = (mins / 60) * rate;

      c.totalMins += mins;
      c.totalCost += cost;
      if (t.is_rework) c.reworkMins += mins;
      if (t.collaborator_name) c.involved.add(t.collaborator_name);

      const jobKey = t.job_id || "sem_job";
      if (!c.jobs[jobKey]) {
        c.jobs[jobKey] = {
          id: jobKey,
          title: t.job_title || "—",
          totalMins: 0,
          reworkMins: 0,
          totalCost: 0,
          records: [],
        };
      }
      c.jobs[jobKey].totalMins += mins;
      c.jobs[jobKey].totalCost += cost;
      if (t.is_rework) c.jobs[jobKey].reworkMins += mins;
      c.jobs[jobKey].records.push({ ...t, cost });
    });

    return Object.values(clientMap).sort((a, b) => b.totalMins - a.totalMins).map(c => ({
      ...c,
      involved: Array.from(c.involved),
      jobs: Object.values(c.jobs).sort((a, b) => b.totalMins - a.totalMins),
    }));
  }, [timesheets, collaborators]);

  // Summary stats
  const totalJobs = useMemo(() => new Set(timesheets.map(t => t.job_id).filter(Boolean)).size, [timesheets]);
  const totalReworkMins = useMemo(() => timesheets.filter(t => t.is_rework).reduce((s, t) => s + (t.duration_minutes || 0), 0), [timesheets]);
  const totalMins = useMemo(() => timesheets.reduce((s, t) => s + (t.duration_minutes || 0), 0), [timesheets]);
  const totalCost = useMemo(() => timesheets.reduce((s, t) => {
    const collab = collaborators.find(c => c.id === t.collaborator_id);
    return s + ((t.duration_minutes || 0) / 60) * (collab?.hourly_rate || 0);
  }, 0), [timesheets, collaborators]);
  const allInvolved = useMemo(() => new Set(timesheets.map(t => t.collaborator_name).filter(Boolean)), [timesheets]);

  if (data.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhum apontamento no período</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Total de Jobs", value: totalJobs, icon: Briefcase, color: "text-primary", bg: "bg-primary/10" },
          { label: "Retrabalhos", value: timesheets.filter(t => t.is_rework).length, icon: RotateCcw, color: "text-orange-600", bg: "bg-orange-100" },
          { label: "Envolvidos", value: allInvolved.size, icon: Users, color: "text-violet-600", bg: "bg-violet-100" },
          { label: "Horas Gastas", value: fmtH(totalMins), icon: Clock, color: "text-blue-600", bg: "bg-blue-100" },
          { label: "Valor Total", value: fmtR(totalCost), icon: DollarSign, color: "text-green-600", bg: "bg-green-100" },
        ].map(stat => (
          <div key={stat.label} className="glass-card p-3.5">
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-7 h-7 ${stat.bg} rounded-lg flex items-center justify-center`}>
                <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
            </div>
            <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Per client */}
      {data.map(client => {
        const isExpanded = expandedClients[client.id];
        return (
          <div key={client.id} className="glass-card overflow-hidden">
            <button
              onClick={() => setExpandedClients(prev => ({ ...prev, [client.id]: !prev[client.id] }))}
              className="w-full flex flex-wrap items-center gap-4 px-5 py-3.5 bg-muted/40 border-b border-border hover:bg-muted/60 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {client.name[0]?.toUpperCase()}
                </div>
                <span className="font-bold text-foreground">{client.name}</span>
                <span className="text-xs text-muted-foreground">({client.jobs.length} jobs)</span>
              </div>
              <div className="ml-auto flex flex-wrap gap-3">
                <span className="text-xs bg-background border border-border rounded-lg px-2.5 py-1 font-bold text-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-500" />{fmtH(client.totalMins)}
                </span>
                {client.reworkMins > 0 && (
                  <span className="text-xs bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1 font-bold text-orange-600 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />{fmtH(client.reworkMins)} retrabalho
                  </span>
                )}
                <span className="text-xs bg-background border border-border rounded-lg px-2.5 py-1 font-bold text-green-600 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />{fmtR(client.totalCost)}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="w-3 h-3" />{client.involved.join(", ")}
                </span>
              </div>
            </button>

            {isExpanded && (
              <div className="divide-y divide-border">
                {client.jobs.map(job => (
                  <div key={job.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">{job.title}</span>
                        {job.reworkMins > 0 && (
                          <span className="text-[10px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                            <RotateCcw className="w-2.5 h-2.5" /> {fmtH(job.reworkMins)} retrabalho
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-foreground">{fmtH(job.totalMins)}</span>
                        <span className="text-xs font-bold text-green-600">{fmtR(job.totalCost)}</span>
                      </div>
                    </div>

                    <div className="space-y-1 ml-5">
                       {job.records.sort((a, b) => (b.started_at || "").localeCompare(a.started_at || "")).map(rec => (
                         <div key={rec.id}
                           onClick={() => setEditingTs(rec)}
                           className={`flex items-center gap-3 p-2 rounded-lg border text-xs cursor-pointer group hover:shadow-sm transition-all ${rec.is_rework ? "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-700 hover:bg-orange-100/80" : "bg-muted/30 border-transparent hover:bg-muted/60"}`}>
                           {rec.is_rework && (
                             <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded-full flex-shrink-0">
                               <RotateCcw className="w-2.5 h-2.5" /> Retrabalho
                             </span>
                           )}
                           <span className="font-medium text-foreground flex-shrink-0">{rec.collaborator_name || "—"}</span>
                           <span className="text-muted-foreground flex-shrink-0">
                             {rec.started_at ? format(new Date(rec.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                           </span>
                           <span className="ml-auto font-bold text-foreground flex-shrink-0">{fmtH(rec.duration_minutes)}</span>
                           {rec.cost > 0 && <span className="font-semibold text-green-600 flex-shrink-0">{fmtR(rec.cost)}</span>}
                           <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                         </div>
                       ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {editingTs && (
        <TimesheetEditModal
          timesheet={editingTs}
          collaborators={collaborators}
          isAdmin={isAdmin}
          onClose={() => setEditingTs(null)}
          onSaved={() => { setEditingTs(null); onRefresh?.(); }}
          onDeleted={() => { setEditingTs(null); onRefresh?.(); }}
        />
      )}
    </div>
  );
}