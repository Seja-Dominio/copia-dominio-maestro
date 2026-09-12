import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArchiveRestore, Trash2, Search, CheckSquare, Square,
  Briefcase, Calendar, Loader2, AlertCircle, Users, 
  DollarSign, FileText, Clock, UserCheck, Package
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ENTITY_CONFIG = {
  job:             { label: "Jobs",          icon: Briefcase,  color: "bg-blue-100 text-blue-700" },
  project:         { label: "Projetos",      icon: Package,    color: "bg-purple-100 text-purple-700" },
  client:          { label: "Clientes",      icon: Users,      color: "bg-green-100 text-green-700" },
  collaborator:    { label: "Colaboradores", icon: UserCheck,  color: "bg-cyan-100 text-cyan-700" },
  subtask:         { label: "Subtarefas",    icon: CheckSquare,color: "bg-orange-100 text-orange-700" },
  timesheet:       { label: "Timesheets",    icon: Clock,      color: "bg-amber-100 text-amber-700" },
  financial_entry: { label: "Financeiro",    icon: DollarSign, color: "bg-emerald-100 text-emerald-700" },
  proposal:        { label: "Propostas",     icon: FileText,   color: "bg-pink-100 text-pink-700" },
  fee_contract:    { label: "Contratos",     icon: FileText,   color: "bg-indigo-100 text-indigo-700" },
  agenda_event:    { label: "Agenda",        icon: Calendar,   color: "bg-teal-100 text-teal-700" },
  mini_task:       { label: "Mini Tarefas",  icon: CheckSquare,color: "bg-violet-100 text-violet-700" },
  supplier:        { label: "Fornecedores",  icon: Users,      color: "bg-slate-100 text-slate-700" },
  notification:    { label: "Notificações",  icon: AlertCircle,color: "bg-red-100 text-red-700" },
};

const ENTITY_MAP = {
  job: "Job", subtask: "Subtask", project: "Project", client: "Client",
  collaborator: "Collaborator", timesheet: "Timesheet", financial_entry: "FinancialEntry",
  proposal: "Proposal", fee_contract: "FeeContract", agenda_event: "AgendaEvent",
  mini_task: "MiniTask", supplier: "Supplier", notification: "Notification",
};

function getDisplayName(dl) {
  const d = dl.entity_data || {};
  return d.title || d.name || d.full_name || d.job_title || d.text || `ID: ${dl.entity_id?.slice(-6)}`;
}

function getSubtitle(dl) {
  const d = dl.entity_data || {};
  const parts = [];
  if (d.client_name) parts.push(d.client_name);
  if (d.project_name) parts.push(d.project_name);
  if (d.responsible_name) parts.push(d.responsible_name);
  if (d.collaborator_name) parts.push(d.collaborator_name);
  if (d.email) parts.push(d.email);
  if (d.amount) parts.push(`R$ ${Number(d.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  return parts.join(" · ");
}

export default function Recovery() {
  const [deleteLogs, setDeleteLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [restoring, setRestoring] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const logs = await base44.entities.DeleteLog.filter({ is_restored: false }, "-deleted_at", 1000);
    setDeleteLogs(logs);
    setLoading(false);
  }

  // Count per type
  const typeCounts = useMemo(() => {
    const counts = { all: deleteLogs.length };
    deleteLogs.forEach(dl => {
      counts[dl.entity_type] = (counts[dl.entity_type] || 0) + 1;
    });
    return counts;
  }, [deleteLogs]);

  // Available tabs (only types that have entries)
  const availableTabs = useMemo(() => {
    const tabs = [{ key: "all", label: "Todos", count: typeCounts.all }];
    Object.entries(ENTITY_CONFIG).forEach(([key, cfg]) => {
      if (typeCounts[key]) tabs.push({ key, label: cfg.label, count: typeCounts[key] });
    });
    return tabs;
  }, [typeCounts]);

  // Filter by tab + search
  const filtered = useMemo(() => {
    let items = deleteLogs;
    if (activeTab !== "all") items = items.filter(dl => dl.entity_type === activeTab);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(dl => {
        const d = dl.entity_data || {};
        return getDisplayName(dl).toLowerCase().includes(s) ||
          getSubtitle(dl).toLowerCase().includes(s) ||
          dl.deleted_by_name?.toLowerCase().includes(s);
      });
    }
    return items;
  }, [deleteLogs, activeTab, search]);

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(dl => dl.id)));
  }

  async function handleRestore() {
    if (selected.size === 0) return;
    setRestoring(true);
    const toRestore = deleteLogs.filter(dl => selected.has(dl.id));

    for (const dl of toRestore) {
      const data = { ...dl.entity_data };
      delete data.id;
      delete data.created_date;
      delete data.updated_date;
      delete data.created_by;
      delete data.created_by_id;

      const entityName = ENTITY_MAP[dl.entity_type];
      if (entityName && base44.entities[entityName]) {
        await base44.entities[entityName].create(data);
      }
      await base44.entities.DeleteLog.update(dl.id, {
        is_restored: true,
        restored_at: new Date().toISOString(),
      });
    }

    setSelected(new Set());
    await loadData();
    setRestoring(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ArchiveRestore className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Recuperação</h1>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {deleteLogs.length} excluído{deleteLogs.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs w-56"
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {availableTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelected(new Set()); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? "bg-white/20" : "bg-background"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 sticky top-14 z-10">
          <span className="text-sm font-semibold text-primary">
            {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <Button size="sm" onClick={() => setSelected(new Set())} variant="outline" className="h-8 text-xs">
            Limpar
          </Button>
          <Button size="sm" onClick={handleRestore} disabled={restoring} className="h-8 text-xs gap-1.5">
            {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5" />}
            {restoring ? "Restaurando..." : `Restaurar (${selected.size})`}
          </Button>
        </div>
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <Trash2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground font-medium">
            {search ? "Nenhum item encontrado" : "Nenhum item excluído para recuperar"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {selected.size === filtered.length
              ? <CheckSquare className="w-4 h-4 text-primary" />
              : <Square className="w-4 h-4" />}
            Selecionar todos ({filtered.length})
          </button>

          {filtered.map(dl => {
            const cfg = ENTITY_CONFIG[dl.entity_type] || ENTITY_CONFIG.job;
            const Icon = cfg.icon;
            const isSelected = selected.has(dl.id);
            const subtitle = getSubtitle(dl);

            return (
              <div
                key={dl.id}
                onClick={() => toggleSelect(dl.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-card hover:border-primary/20 hover:bg-muted/30"
                }`}
              >
                {isSelected
                  ? <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />
                  : <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />}

                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">
                      {getDisplayName(dl)}
                    </span>
                    {activeTab === "all" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {cfg.label}
                      </Badge>
                    )}
                  </div>
                  {subtitle && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
                  )}
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-red-500 font-medium">
                    {dl.deleted_at ? format(new Date(dl.deleted_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    por {dl.deleted_by_name || "—"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}