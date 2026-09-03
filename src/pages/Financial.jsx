import { useState, useEffect, useCallback, useMemo } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh.jsx";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, TrendingUp, TrendingDown, ArrowLeftRight,
  Wallet, Filter,
  Clock,
  Star, ArrowUp, ArrowDown, BarChart3
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import CreateEntryModal from "../components/financial/CreateEntryModal";
import BankAccountsIndicator from "../components/financial/BankAccountsIndicator";
import FinancialEntriesList from "../components/financial/EntriesListView";
import MovimentacoesList from "../components/financial/MovimentacoesList";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import { safeDelete } from "@/lib/safeDelete";
import CashFlowChart from "@/components/dashboard/CashFlowChart";
import FinancialPieCharts from "@/components/financial/FinancialPieCharts";
import AccountBalancesTab from "@/components/financial/AccountBalancesTab";
import { useFinancialDragDrop, FinancialEditBar, FinancialDragGrid } from "@/components/financial/FinancialWidgetGrid";

const TYPE_CONFIG = {
  revenue: { label: "Receita", icon: TrendingUp, color: "text-green-600", bg: "bg-green-100" },
  expense: { label: "Despesa", icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
  transfer: { label: "Transferência", icon: ArrowLeftRight, color: "text-blue-600", bg: "bg-blue-100" },
};

const STATUS_CONFIG = {
forecast: { label: "A realizar", color: "bg-blue-100 text-blue-700" },
pending: { label: "A realizar", color: "bg-blue-100 text-blue-700" },
overdue: { label: "Vencido", color: "bg-red-100 text-red-700" },
paid: { label: "Realizado", color: "bg-green-100 text-green-700" },
cancelled: { label: "Cancelado", color: "bg-gray-100 text-gray-400" },
};

const CATEGORY_LABELS = {
  fee: "FEE",
  production: "Produção",
  media: "Mídia",
  supplier: "Fornecedor",
  salary: "Salário",
  tax: "Imposto",
  tools: "Ferramentas",
  rent: "Aluguel",
  other: "Outros",
};

const ACCOUNTS_COLORS = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-amber-500", "bg-pink-500"];

export default function Financial() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [savingsBoxes, setSavingsBoxes] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = (() => { try { return JSON.parse(sessionStorage.getItem("collaborator") || "null")?.access_level === "admin"; } catch { return false; } })();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState("revenue");
  const [topClientTab, setTopClientTab] = useState("revenue");
  const [editingEntry, setEditingEntry] = useState(null);
  const [activeTab, setActiveTab] = useState("lancamentos");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState(null);
  const [mainView, setMainView] = useState("tabela"); // "tabela" | "acompanhamento"

  const dnd = useFinancialDragDrop();

  const loadData = useCallback(async () => {
    setLoading(true);
    // Split into 2 batches to avoid rate limits
    const [e, a, sb] = await Promise.all([
      base44.entities.FinancialEntry.list("-due_date", 200),
      base44.entities.BankAccount.list(),
      base44.entities.SavingsBox.filter({ is_active: true }, "name", 200),
    ]);
    const [ts, j, cl] = await Promise.all([
      base44.entities.Timesheet.list("-created_date", 300),
      base44.entities.Job.list("-created_date", 200),
      base44.entities.Client.list("name", 100),
    ]);
    setEntries(e);
    setAccounts(a);
    setSavingsBoxes(sb);
    setTimesheets(ts.filter(t => !t.is_running));
    setJobs(j);
    setClients(cl);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const { containerRef, handlers, PullIndicator } = usePullToRefresh(loadData);

  // Period filter helpers
  const getWeekRange = (offset = 0) => {
    const today = new Date();
    const day = today.getDay(); // 0=sun
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().slice(0, 10),
      end: sunday.toISOString().slice(0, 10),
    };
  };

  const getCurrentMonthRange = () => {
    const today = new Date();
    const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
    return { start, end };
  };

  const getLastMonthRange = () => {
    const today = new Date();
    const prevMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    const prevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const start = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
    const end = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${lastDay}`;
    return { start, end };
  };

  const getNextMonthRange = () => {
    const today = new Date();
    const nextMonth = today.getMonth() === 11 ? 0 : today.getMonth() + 1;
    const nextYear = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    const start = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
    const end = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${lastDay}`;
    return { start, end };
  };

  const filtered = entries.filter(e => {
    const matchSearch = !search || e.title?.toLowerCase().includes(search.toLowerCase()) || e.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || e.type === typeFilter;

    let matchStatus = true;
    if (statusFilter === "pending") {
      matchStatus = e.status === "pending" || e.status === "forecast" || e.status === "overdue";
    } else if (statusFilter === "paid") {
      matchStatus = e.status === "paid";
    } else if (statusFilter === "all") {
      matchStatus = true;
    }

    let matchPeriod = true;
     const date = e.due_date || e.competence_date || e.payment_date;
     if (periodFilter !== "all" && date) {
       let range;
       if (periodFilter === "current_month") range = getCurrentMonthRange();
       else if (periodFilter === "last_month") range = getLastMonthRange();
       else if (periodFilter === "next_month") range = getNextMonthRange();
       else if (periodFilter === "current_week") range = getWeekRange(0);
       else if (periodFilter === "last_week") range = getWeekRange(-1);
       else if (periodFilter === "custom") range = { start: customStart, end: customEnd };
       if (range?.start && range?.end) matchPeriod = date >= range.start && date <= range.end;
     }

    return matchSearch && matchType && matchStatus && matchPeriod;
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isCurrentMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  // Métricas do mês atual (igual ao Dashboard)
  const currentMonthEntries = entries.filter(e => {
    const date = e.competence_date || e.due_date || e.payment_date;
    return date && isCurrentMonth(date);
  });
  const totalRevenue = currentMonthEntries.filter(e => e.type === "revenue" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpense = currentMonthEntries.filter(e => e.type === "expense" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  const pendingRevenue = currentMonthEntries.filter(e => e.type === "revenue" && (e.status === "pending" || e.status === "forecast")).reduce((s, e) => s + (e.amount || 0), 0);
  const monthlyExpensePending = currentMonthEntries.filter(e => e.type === "expense" && (e.status === "pending" || e.status === "forecast")).reduce((s, e) => s + (e.amount || 0), 0);
  const balanceBetweenRealized = totalRevenue - totalExpense;
  const profitability = totalRevenue > 0 ? ((balanceBetweenRealized) / totalRevenue * 100).toFixed(1) : 0;
  const monthlyRevenueForecast = currentMonthEntries.filter(e => e.type === "revenue" && (e.status === "paid" || e.status === "pending" || e.status === "forecast")).reduce((s, e) => s + (e.amount || 0), 0);

  // Top 5 clients data
  const clientStatsMap = {};
  entries.filter(e => e.client_id).forEach(e => {
    if (!clientStatsMap[e.client_id]) clientStatsMap[e.client_id] = { id: e.client_id, name: e.client_name, revenue: 0, expense: 0 };
    if (e.type === "revenue" && e.status === "paid") clientStatsMap[e.client_id].revenue += (e.amount || 0);
    if (e.type === "expense" && e.status === "paid") clientStatsMap[e.client_id].expense += (e.amount || 0);
  });
  timesheets.forEach(t => {
    if (!t.client_id) return;
    if (!clientStatsMap[t.client_id]) clientStatsMap[t.client_id] = { id: t.client_id, name: t.client_name, revenue: 0, expense: 0 };
    clientStatsMap[t.client_id].hours = (clientStatsMap[t.client_id].hours || 0) + (t.duration_minutes || 0) / 60;
  });
  jobs.forEach(j => {
    if (!j.client_id) return;
    if (!clientStatsMap[j.client_id]) clientStatsMap[j.client_id] = { id: j.client_id, name: j.client_name, revenue: 0, expense: 0 };
    clientStatsMap[j.client_id].jobCount = (clientStatsMap[j.client_id].jobCount || 0) + 1;
  });
  // Attach monthly_deliveries from clients
  clients.forEach(c => {
    if (clientStatsMap[c.id]) clientStatsMap[c.id].monthly_deliveries = c.monthly_deliveries || 0;
  });

  const clientStats = Object.values(clientStatsMap);

  const topByRevenue = [...clientStats].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const topByHours = [...clientStats].sort((a, b) => (b.hours || 0) - (a.hours || 0)).slice(0, 5);
  const topByExpense = [...clientStats].sort((a, b) => b.expense - a.expense).slice(0, 5);
  const aboveDelivery = clientStats.filter(c => c.monthly_deliveries > 0 && (c.jobCount || 0) > c.monthly_deliveries)
    .sort((a, b) => (b.jobCount - b.monthly_deliveries) - (a.jobCount - a.monthly_deliveries)).slice(0, 5);
  const belowDelivery = clientStats.filter(c => c.monthly_deliveries > 0 && (c.jobCount || 0) < c.monthly_deliveries)
    .sort((a, b) => (a.jobCount - a.monthly_deliveries) - (b.jobCount - b.monthly_deliveries)).slice(0, 5);

  function handleCreate(type) {
    setCreateType(type);
    setShowCreate(true);
  }

  return (
    <div ref={containerRef} className="p-6" style={{ WebkitOverflowScrolling: "touch" }} {...handlers}>
      <PullIndicator />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão financeira centralizada</p>
        </div>
        <div className="flex gap-2 flex-wrap">
           <Button onClick={() => handleCreate("revenue")} variant="outline" className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
             <Plus className="w-4 h-4" /> Receita
           </Button>
           <Button onClick={() => handleCreate("expense")} variant="outline" className="gap-2 border-red-300 text-red-700 hover:bg-red-50">
             <Plus className="w-4 h-4" /> Despesa
           </Button>
           <Button onClick={() => handleCreate("transfer")} variant="outline" className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50">
             <ArrowLeftRight className="w-4 h-4" /> Transferência
           </Button>
           <Link to="/Reports?section=financial">
             <Button variant="outline" className="gap-2">
               <BarChart3 className="w-4 h-4" /> Relatórios
             </Button>
           </Link>
           {mainView === "acompanhamento" && (
             <FinancialEditBar
               isEditMode={dnd.isEditMode}
               setIsEditMode={dnd.setIsEditMode}
               widgetOrder={dnd.widgetOrder}
               visibleWidgets={dnd.visibleWidgets}
               toggleVisibility={dnd.toggleVisibility}
               widgetLabels={{
                 summary_cards: "Resumo",
                 pie_charts: "Gráficos Pizza",
                 bank_accounts: "Contas",
                 top_clients: "Top Clientes",
                 cash_flow: "Fluxo de Caixa",
               }}
             />
           )}
        </div>
      </div>

      {/* Main view tabs */}
      <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
        {[
          { key: "tabela", label: "Tabela" },
          { key: "acompanhamento", label: "Acompanhamento" },
          { key: "saldo_contas", label: "Saldo entre Contas" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setMainView(tab.key)}
            className={`px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${mainView === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ ABA TABELA ═══ */}
      {mainView === "tabela" && (
        <div>
          {/* Faturamento a Realizar */}
          <div className="glass-card p-4 mb-4 border-primary/30 bg-primary/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Faturamento a Realizar — Mês</p>
                <p className="text-2xl font-black text-primary">
                  R$ {monthlyRevenueForecast.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">realizado + pendente + a realizar</p>
              </div>
              <div className="flex flex-col items-end gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-muted-foreground">R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} realizado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  <span className="text-muted-foreground">R$ {pendingRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} pendente</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-muted-foreground">R$ {(monthlyRevenueForecast - totalRevenue - pendingRevenue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} a realizar</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lançamentos / Movimentações tabs */}
          <div className="flex gap-1 mb-4 border-b border-border">
            {[
              { key: "lancamentos", label: "Lançamentos" },
              { key: "movimentacoes", label: "Movimentações" },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px ${activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "lancamentos" && (
            <>
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Buscar lançamentos..." value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {["all", "revenue", "expense", "transfer"].map(t => (
                      <button key={t} onClick={() => setTypeFilter(t)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        {t === "all" ? "Todos" : TYPE_CONFIG[t]?.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { value: "pending", label: "A realizar", cls: "bg-blue-600 text-white" },
                      { value: "paid", label: "Realizados", cls: "bg-green-600 text-white" },
                      { value: "all", label: "Todos os status", cls: "bg-primary text-primary-foreground" },
                    ].map(s => (
                      <button key={s.value} onClick={() => setStatusFilter(s.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === s.value ? s.cls : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap items-center">
                  <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  {[
                    { value: "all", label: "Todos os períodos" },
                    { value: "current_month", label: "Mês atual" },
                    { value: "last_month", label: "Mês passado" },
                    { value: "next_month", label: "Próximo mês" },
                    { value: "current_week", label: "Semana atual" },
                    { value: "last_week", label: "Semana passada" },
                    { value: "custom", label: "Personalizado" },
                  ].map(p => (
                    <button key={p.value} onClick={() => setPeriodFilter(p.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${periodFilter === p.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                      {p.label}
                    </button>
                  ))}
                  {periodFilter === "custom" && (
                    <div className="flex gap-2">
                      <input type="date" className="h-8 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" value={customStart} onChange={e => setCustomStart(e.target.value)} />
                      <input type="date" className="h-8 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
              <div className="glass-card overflow-hidden">
                <FinancialEntriesList
                  entries={filtered}
                  loading={loading}
                  isAdmin={isAdmin}
                  onEdit={entry => setEditingEntry(entry)}
                  onBulkAction={async (action, selectedEntries) => {
                    const paidDate = new Date().toISOString().slice(0, 10);
                    const updates = selectedEntries.map(e => {
                      const data = action === "paid" ? { status: "paid", payment_date: paidDate } : { status: "cancelled" };
                      return base44.entities.FinancialEntry.update(e.id, data);
                    });
                    await Promise.all(updates);
                    loadData();
                  }}
                  onMarkPaid={async (e) => {
                    const paidDate = new Date().toISOString().slice(0, 10);
                    setEntries(prev => prev.map(x => x.id === e.id ? { ...x, status: "paid", payment_date: paidDate } : x));
                    const updated = await base44.entities.FinancialEntry.update(e.id, { status: "paid", payment_date: paidDate });
                    setEntries(prev => prev.map(x => x.id === e.id ? updated : x));
                  }}
                  onDelete={(e) => setDeleteTarget(e)}
                  onBulkDelete={(selectedEntries) => setBulkDeleteTargets(selectedEntries)}
                />
              </div>
            </>
          )}

          {activeTab === "movimentacoes" && (
            <div className="glass-card overflow-hidden">
              <MovimentacoesList entries={filtered} loading={loading} />
            </div>
          )}
        </div>
      )}

      {/* ═══ ABA ACOMPANHAMENTO ═══ */}
      {mainView === "acompanhamento" && (
        <FinancialDragGrid
          isEditMode={dnd.isEditMode}
          widgetOrder={dnd.widgetOrder}
          visibleWidgets={dnd.visibleWidgets}
          handleReorder={dnd.handleReorder}
          widgetRegistry={{
            summary_cards: {
              label: "Cards de Resumo",
              render: () => (
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-2">
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-green-600" /></div>
                      <span className="text-xs font-medium text-muted-foreground">Receita Realizada</span>
                    </div>
                    <p className="text-xl font-bold text-green-600">R$ {totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-emerald-600" /></div>
                      <span className="text-xs font-medium text-muted-foreground">Receitas a Realizar</span>
                    </div>
                    <p className="text-xl font-bold text-emerald-600">R$ {pendingRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center"><TrendingDown className="w-3.5 h-3.5 text-destructive" /></div>
                      <span className="text-xs font-medium text-muted-foreground">Despesa Realizada</span>
                    </div>
                    <p className="text-xl font-bold text-destructive">R$ {totalExpense.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center"><Clock className="w-3.5 h-3.5 text-amber-600" /></div>
                      <span className="text-xs font-medium text-muted-foreground">Despesas a Realizar</span>
                    </div>
                    <p className="text-xl font-bold text-amber-600">R$ {monthlyExpensePending.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center"><Wallet className="w-3.5 h-3.5 text-blue-600" /></div>
                      <span className="text-xs font-medium text-muted-foreground">Saldo Realizado</span>
                    </div>
                    <p className={`text-xl font-bold ${balanceBetweenRealized >= 0 ? "text-green-600" : "text-destructive"}`}>
                      R$ {balanceBetweenRealized.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="glass-card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-primary" /></div>
                      <span className="text-xs font-medium text-muted-foreground">Lucratividade</span>
                    </div>
                    <p className={`text-xl font-bold ${Number(profitability) >= 0 ? "text-green-600" : "text-destructive"}`}>{profitability}%</p>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(Math.max(Number(profitability), 0), 100)}%` }} />
                    </div>
                  </div>
                </div>
              ),
            },
            pie_charts: {
              label: "Gráficos Pizza",
              render: () => (
                <FinancialPieCharts entries={entries} accounts={accounts} />
              ),
            },
            bank_accounts: {
              label: "Contas Bancárias",
              render: () => accounts.length > 0 ? (
                <div className="mb-2">
                  <BankAccountsIndicator accounts={accounts} entries={entries} savingsBoxes={savingsBoxes} onRefresh={loadData} />
                </div>
              ) : null,
            },
            top_clients: {
              label: "Top 5 Clientes",
              render: () => (
                <div className="glass-card mb-2 overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
                    <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center"><Star className="w-3.5 h-3.5 text-white" /></div>
                    <h2 className="text-sm font-bold text-foreground">Top 5 Clientes</h2>
                  </div>
                  <div className="flex gap-1 px-4 pt-3 overflow-x-auto">
                    {[
                      { key: "revenue", label: "Mais Pagam" },
                      { key: "hours", label: "Mais Horas" },
                      { key: "expense", label: "Mais Gasto" },
                      { key: "above", label: "Acima do Contratado" },
                      { key: "below", label: "Abaixo do Contratado" },
                    ].map(tab => (
                      <button key={tab.key} onClick={() => setTopClientTab(tab.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${topClientTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-4 space-y-2 max-h-52 overflow-y-auto">
                    {(topClientTab === "revenue" ? topByRevenue :
                      topClientTab === "hours" ? topByHours :
                      topClientTab === "expense" ? topByExpense :
                      topClientTab === "above" ? aboveDelivery : belowDelivery
                    ).map((c, i) => (
                      <div key={c.id || c.name} className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-xl">
                        <span className="text-xs font-black text-muted-foreground w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-foreground truncate">{c.name}</p></div>
                        {topClientTab === "revenue" && <span className="text-xs font-bold text-green-600">R$ {c.revenue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>}
                        {topClientTab === "hours" && <span className="text-xs font-bold text-blue-600">{(c.hours || 0).toFixed(1)}h</span>}
                        {topClientTab === "expense" && <span className="text-xs font-bold text-destructive">R$ {c.expense.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>}
                        {topClientTab === "above" && <span className="text-xs font-bold text-amber-600 flex items-center gap-1"><ArrowUp className="w-3 h-3" />{c.jobCount} / {c.monthly_deliveries}</span>}
                        {topClientTab === "below" && <span className="text-xs font-bold text-red-600 flex items-center gap-1"><ArrowDown className="w-3 h-3" />{c.jobCount || 0} / {c.monthly_deliveries}</span>}
                      </div>
                    ))}
                    {(topClientTab === "above" ? aboveDelivery : topClientTab === "below" ? belowDelivery : []).length === 0 && (topClientTab === "above" || topClientTab === "below") && (
                      <p className="text-xs text-muted-foreground text-center py-4">Sem dados — verifique se os clientes têm entregas mensais configuradas</p>
                    )}
                  </div>
                </div>
              ),
            },
            cash_flow: {
              label: "Fluxo de Caixa",
              render: () => (
                <div className="glass-card p-5 mb-2">
                  <h2 className="text-sm font-bold text-foreground mb-4">Fluxo de Caixa Diário</h2>
                  <CashFlowChart
                    entries={entries}
                    period={
                      periodFilter === "current_month" ? getCurrentMonthRange() :
                      periodFilter === "last_month" ? getLastMonthRange() :
                      periodFilter === "next_month" ? getNextMonthRange() :
                      periodFilter === "current_week" ? getWeekRange(0) :
                      periodFilter === "last_week" ? getWeekRange(-1) :
                      periodFilter === "custom" && customStart && customEnd ? { start: customStart, end: customEnd } :
                      null
                    }
                  />
                </div>
              ),
            },
          }}
        />
      )}

      {/* ═══ ABA SALDO ENTRE CONTAS ═══ */}
      {mainView === "saldo_contas" && (
        <AccountBalancesTab accounts={accounts} savingsBoxes={savingsBoxes} onRefresh={loadData} />
      )}

      <ConfirmDeleteModal
        title="Excluir lançamento?"
        itemName={deleteTarget?.title || ""}
        message="Esta ação não pode ser desfeita."
        isOpen={!!deleteTarget}
        onConfirm={async () => {
          await safeDelete("financial_entry", "FinancialEntry", deleteTarget);
          setEntries(prev => prev.filter(x => x.id !== deleteTarget.id));
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDeleteModal
        title={`Apagar ${bulkDeleteTargets?.length || 0} lançamentos?`}
        itemName=""
        message="Todos os lançamentos selecionados serão excluídos permanentemente. Esta ação não pode ser desfeita."
        isOpen={!!bulkDeleteTargets}
        onConfirm={async () => {
          await Promise.all(bulkDeleteTargets.map(e => safeDelete("financial_entry", "FinancialEntry", e)));
          const ids = bulkDeleteTargets.map(e => e.id);
          setEntries(prev => prev.filter(x => !ids.includes(x.id)));
          setBulkDeleteTargets(null);
        }}
        onCancel={() => setBulkDeleteTargets(null)}
      />

      {(showCreate || editingEntry) && (
        <CreateEntryModal
          type={createType}
          entry={editingEntry}
          onClose={() => {
            setShowCreate(false);
            setEditingEntry(null);
          }}
          onCreate={entry => {
            if (editingEntry) {
              setEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
            } else {
              if (Array.isArray(entry)) {
                setEntries(prev => [...entry, ...prev]);
              } else {
                setEntries(prev => [entry, ...prev]);
              }
            }
            setShowCreate(false);
            setEditingEntry(null);
          }}
        />
      )}


    </div>
  );
}