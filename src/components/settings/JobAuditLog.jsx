import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarX2, Trash2, Ban, AlertTriangle, Loader2, Search, Filter } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";

const TYPE_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "date_change", label: "Alteração de Data" },
  { id: "cancelled", label: "Cancelamentos" },
  { id: "deleted_job", label: "Exclusão Job" },
  { id: "deleted_agenda", label: "Exclusão Agenda" },
  { id: "deleted_financial", label: "Exclusão Financeiro" },
  { id: "deleted_proposal", label: "Exclusão Proposta" },
  { id: "deleted_other", label: "Outras Exclusões" },
];

export default function JobAuditLog() {
  const [history, setHistory] = useState([]);
  const [deleteLogs, setDeleteLogs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      base44.entities.JobHistory.filter({ type: "change" }, "-created_date", 2000),
      base44.entities.DeleteLog.list("-created_date", 1000),
      base44.entities.Job.list("-created_date", 2000),
    ]).then(([h, d, j]) => {
      setHistory(h);
      setDeleteLogs(d);
      setJobs(j);
    }).finally(() => setLoading(false));
  }, []);

  const jobMap = useMemo(() => {
    const map = {};
    jobs.forEach(j => { map[j.id] = j; });
    return map;
  }, [jobs]);

  const events = useMemo(() => {
    const list = [];

    // Date changes
    history.filter(h => h.field === "post_date").forEach(h => {
      const job = jobMap[h.job_id];
      list.push({
        type: "date_change",
        date: h.created_date,
        title: job?.title || h.text?.replace(/^.*?: /, "") || "—",
        entityId: h.job_id,
        project: job?.project_name || "—",
        client: job?.client_name || "—",
        user: h.user || "—",
        oldValue: h.old_value,
        newValue: h.new_value,
      });
    });

    // Cancellations
    history.filter(h => h.field === "status" && h.new_value === "cancelled").forEach(h => {
      const job = jobMap[h.job_id];
      list.push({
        type: "cancelled",
        date: h.created_date,
        title: job?.title || h.text?.replace(/^.*?: /, "") || "—",
        entityId: h.job_id,
        project: job?.project_name || "—",
        client: job?.client_name || "—",
        user: h.user || "—",
        oldValue: h.old_value,
        newValue: "cancelled",
      });
    });

    // Deletions — grouped by entity_type
    deleteLogs.forEach(d => {
      const entityType = d.entity_type;
      let type = "deleted_other";
      if (entityType === "job") type = "deleted_job";
      else if (entityType === "agenda_event") type = "deleted_agenda";
      else if (entityType === "financial_entry") type = "deleted_financial";
      else if (entityType === "proposal") type = "deleted_proposal";

      const data = d.entity_data || {};
      let title = data.title || data.name || `${entityType} sem título`;
      let project = data.project_name || "—";
      let client = data.client_name || "—";

      // For jobs, try to enrich
      if (entityType === "job") {
        title = data.title || "Job sem título";
        project = data.project_name || "—";
        client = data.client_name || "—";
      } else if (entityType === "agenda_event") {
        title = data.title || "Evento sem título";
        client = data.client_name || "—";
      } else if (entityType === "financial_entry") {
        title = data.title || "Lançamento sem título";
        client = data.client_name || "—";
      } else if (entityType === "proposal") {
        title = data.title || "Proposta sem título";
        client = data.client_name || "—";
      }

      list.push({
        type,
        date: d.deleted_at || d.created_date,
        title,
        entityId: d.entity_id,
        project,
        client,
        user: d.deleted_by_name || "—",
        oldValue: data.post_date || data.due_date || data.date || "",
        newValue: null,
        reason: d.reason,
        entityType,
      });
    });

    list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    return list;
  }, [history, deleteLogs, jobMap]);

  // Unique users and clients for filters
  const uniqueUsers = useMemo(() => [...new Set(events.map(e => e.user).filter(u => u && u !== "—"))].sort(), [events]);
  const uniqueClients = useMemo(() => [...new Set(events.map(e => e.client).filter(c => c && c !== "—"))].sort(), [events]);

  const filtered = useMemo(() => {
    let result = events;
    if (filter !== "all") result = result.filter(e => e.type === filter);
    if (userFilter !== "all") result = result.filter(e => e.user === userFilter);
    if (clientFilter !== "all") result = result.filter(e => e.client === clientFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(e =>
        e.title?.toLowerCase().includes(s) ||
        e.user?.toLowerCase().includes(s) ||
        e.project?.toLowerCase().includes(s) ||
        e.client?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [events, filter, search, userFilter, clientFilter]);

  const fmtDate = (d) => {
    if (!d) return "—";
    try { return format(parseISO(d), "dd/MM/yy", { locale: ptBR }); } catch { return d; }
  };

  const fmtDateTime = (d) => {
    if (!d) return "—";
    try { return format(parseISO(d), "dd/MM/yy HH:mm", { locale: ptBR }); } catch { return d; }
  };

  const typeIcon = (type) => {
    if (type === "date_change") return <CalendarX2 className="w-3.5 h-3.5 text-amber-600" />;
    if (type === "cancelled") return <Ban className="w-3.5 h-3.5 text-red-600" />;
    return <Trash2 className="w-3.5 h-3.5 text-red-800" />;
  };

  const typeLabel = (type) => {
    switch (type) {
      case "date_change": return "Data alterada";
      case "cancelled": return "Cancelado";
      case "deleted_job": return "Job excluído";
      case "deleted_agenda": return "Evento excluído";
      case "deleted_financial": return "Financeiro excluído";
      case "deleted_proposal": return "Proposta excluída";
      case "deleted_other": return "Excluído";
      default: return type;
    }
  };

  const detailText = (ev) => {
    if (ev.type === "date_change") return `${fmtDate(ev.oldValue)} → ${fmtDate(ev.newValue)}`;
    if (ev.type === "cancelled") return `Status: ${ev.oldValue || "—"} → cancelado`;
    if (ev.reason) return ev.reason;
    if (ev.oldValue) return `Data: ${fmtDate(ev.oldValue)}`;
    return "—";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Histórico de Alterações Críticas</h3>
          <p className="text-sm text-muted-foreground">Exclusões, cancelamentos e mudanças de data — Jobs, Agenda, Financeiro, Propostas</p>
        </div>
      </div>

      {/* Type filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 bg-muted rounded-lg p-0.5">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all whitespace-nowrap ${
                filter === f.id
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* User/Client/Search filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <select
            value={userFilter}
            onChange={e => setUserFilter(e.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="all">Todos os usuários</option>
            {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
        >
          <option value="all">Todos os clientes</option>
          {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título, projeto, cliente..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} registros</span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[110px_1fr_120px_120px_150px_120px_120px] gap-1 px-3 py-2.5 bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase">
          <span>Quando</span>
          <span>Título</span>
          <span>Projeto</span>
          <span>Cliente</span>
          <span>Detalhe</span>
          <span>Quem</span>
          <span>Tipo</span>
        </div>
        <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div>
          ) : (
            filtered.slice(0, 300).map((ev, i) => (
              <div key={`${ev.entityId}-${ev.type}-${i}`} className="grid grid-cols-[110px_1fr_120px_120px_150px_120px_120px] gap-1 px-3 py-2 items-center hover:bg-muted/30 transition-colors">
                <span className="text-[10px] text-muted-foreground">{fmtDateTime(ev.date)}</span>
                <span className="text-[11px] font-medium text-foreground truncate" title={ev.title}>{ev.title}</span>
                <span className="text-[10px] text-muted-foreground truncate" title={ev.project}>{ev.project}</span>
                <span className="text-[10px] text-muted-foreground truncate" title={ev.client}>{ev.client}</span>
                <span className="text-[10px] text-muted-foreground truncate" title={detailText(ev)}>{detailText(ev)}</span>
                <span className="text-[10px] text-foreground font-medium truncate">{ev.user}</span>
                <span className="flex items-center gap-1 text-[10px] font-semibold whitespace-nowrap">
                  {typeIcon(ev.type)}
                  <span className="truncate">{typeLabel(ev.type)}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}