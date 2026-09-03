import { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Filter, Crown, Users, TrendingDown, TrendingUp, ChevronDown } from "lucide-react";
import { MobileSelect } from "@/components/ui/bottom-sheet";
import { usePullToRefresh } from "@/hooks/usePullToRefresh.jsx";
import ClientNpsCard from "@/components/clients/ClientNpsCard";
import ClientEditDrawer from "@/components/clients/ClientEditDrawer";
import { getNpsColor } from "@/components/clients/NpsScoreBadge";
import { checkAndApplyLatePostPenalties } from "@/components/clients/npsJobWatcher";

const TIERS = [
  { value: "all", label: "Todos os tiers" },
  { value: "elite", label: "Elite" },
  { value: "standard", label: "Padrão" },
];

const NPS_FILTERS = [
  { value: "all", label: "Todas as notas" },
  { value: "critical", label: "Crítico (< 70)" },
  { value: "good", label: "Bom (70–89)" },
  { value: "excellent", label: "Excelente (≥ 90)" },
];

export default function ClientPortfolio() {
  const [clients, setClients] = useState([]);
  const [npsHistory, setNpsHistory] = useState([]);
  const [npsEntries, setNpsEntries] = useState([]);
  const [feeEntries, setFeeEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [tierFilter, setTierFilter] = useState("all");
  const [npsFilter, setNpsFilter] = useState("all");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [autoOpenClientId, setAutoOpenClientId] = useState(null);

  const load = useCallback(async () => {
    const [c, h, e, fe] = await Promise.all([
      base44.entities.Client.list("name", 200),
      base44.entities.NpsHistory.list("-created_date", 500),
      base44.entities.NpsEntry.list("-created_date", 200),
      base44.entities.FinancialEntry.filter({ type: "revenue", origin: "fee_contract" }, "-due_date", 500),
    ]);
    setClients(c);
    setNpsHistory(h);
    setNpsEntries(e);
    setFeeEntries(fe);
    setLoading(false);
  }, []);

  const { containerRef, handlers, PullIndicator } = usePullToRefresh(load);

  // Calcula última data de fee por cliente
  const contractExpiryByClient = useMemo(() => {
    const map = {};
    feeEntries.forEach(e => {
      if (!e.client_id) return;
      const d = e.due_date || e.billing_date || e.competence_date;
      if (!d) return;
      if (!map[e.client_id] || d > map[e.client_id]) map[e.client_id] = d;
    });
    return map;
  }, [feeEntries]);

  useEffect(() => {
    checkAndApplyLatePostPenalties().then(load).catch(() => load());
    const params = new URLSearchParams(window.location.search);
    const openId = params.get("openClient");
    if (openId) {
      setAutoOpenClientId(openId);
      // Remove the param from URL without reload
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Unique responsibles
  const responsibles = [...new Set(clients.map(c => c.responsible).filter(Boolean))];

  // Filter clients
  const filtered = clients.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (tierFilter !== "all" && (c.tier || "standard") !== tierFilter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (responsibleFilter !== "all" && c.responsible !== responsibleFilter) return false;
    if (npsFilter === "critical" && (c.nps_score ?? 100) >= 70) return false;
    if (npsFilter === "good" && ((c.nps_score ?? 100) < 70 || (c.nps_score ?? 100) >= 90)) return false;
    if (npsFilter === "excellent" && (c.nps_score ?? 100) < 90) return false;
    return true;
  }).sort((a, b) => (a.nps_score ?? 100) - (b.nps_score ?? 100)); // lowest NPS first

  const eliteClients = filtered.filter(c => (c.tier || "standard") === "elite");
  const standardClients = filtered.filter(c => (c.tier || "standard") !== "elite");

  const totalActive = clients.filter(c => c.status === "active").length;
  const criticalCount = clients.filter(c => c.status === "active" && (c.nps_score ?? 100) < 70).length;
  const avgNps = clients.filter(c => c.status === "active").length > 0
    ? Math.round(clients.filter(c => c.status === "active").reduce((s, c) => s + (c.nps_score ?? 100), 0) / clients.filter(c => c.status === "active").length)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-6 max-w-[1400px] mx-auto" style={{ WebkitOverflowScrolling: "touch" }} {...handlers}>
      <PullIndicator />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Carteira de Clientes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalActive} ativos · NPS médio: <span className="font-bold">{avgNps}</span> · {criticalCount > 0 && <span className="text-red-600 font-bold">{criticalCount} críticos</span>}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Clientes Ativos", value: totalActive, color: "bg-primary", icon: Users },
          { label: "Elite", value: clients.filter(c => c.status === "active" && c.tier === "elite").length, color: "bg-amber-500", icon: Crown },
          { label: "NPS Médio", value: avgNps, color: avgNps >= 90 ? "bg-green-500" : avgNps >= 70 ? "bg-amber-400" : "bg-red-500", icon: TrendingUp },
          { label: "Críticos", value: criticalCount, color: "bg-red-500", icon: TrendingDown },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 ${k.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
              <k.icon className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{k.label}</p>
              <p className="text-xl font-black text-foreground">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 mb-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-semibold transition-colors ${showFilters ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            <Filter className="w-3.5 h-3.5" /> Filtros avançados
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Status</label>
              <MobileSelect
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="Status"
                options={[{ value: "all", label: "Todos" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }]}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Tier</label>
              <MobileSelect
                value={tierFilter}
                onChange={setTierFilter}
                placeholder="Tier"
                options={TIERS}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Nota NPS</label>
              <MobileSelect
                value={npsFilter}
                onChange={setNpsFilter}
                placeholder="Nota NPS"
                options={NPS_FILTERS}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Responsável</label>
              <MobileSelect
                value={responsibleFilter}
                onChange={setResponsibleFilter}
                placeholder="Responsável"
                options={[{ value: "all", label: "Todos" }, ...responsibles.map(r => ({ value: r, label: r }))]}
              />
            </div>
          </div>
        )}
      </div>

      {/* ELITE BLOCK */}
      {eliteClients.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
              <Crown className="w-3.5 h-3.5 text-white" />
            </div>
            <h2 className="text-sm font-bold text-foreground">Clientes Elite</h2>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{eliteClients.length}</span>
            <div className="flex-1 h-px bg-amber-200 dark:bg-amber-800" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {eliteClients.map(c => (
              <ClientNpsCard
                key={c.id}
                client={c}
                npsHistory={npsHistory}
                npsEntries={npsEntries}
                onUpdated={load}
                contractExpiry={contractExpiryByClient[c.id] || null}
              />
            ))}
          </div>
        </div>
      )}

      {/* STANDARD BLOCK */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <h2 className="text-sm font-bold text-foreground">Clientes Padrão</h2>
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-semibold">{standardClients.length}</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        {standardClients.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Nenhum cliente encontrado com os filtros aplicados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {standardClients.map(c => (
              <ClientNpsCard
                key={c.id}
                client={c}
                npsHistory={npsHistory}
                npsEntries={npsEntries}
                onUpdated={load}
                contractExpiry={contractExpiryByClient[c.id] || null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Auto-open drawer from proposal approval */}
      {autoOpenClientId && (() => {
        const c = clients.find(x => x.id === autoOpenClientId);
        if (!c) return null;
        return (
          <ClientEditDrawer
            client={c}
            npsHistory={npsHistory}
            npsEntries={npsEntries}
            initialTab="dados"
            onClose={() => setAutoOpenClientId(null)}
            onSaved={() => { setAutoOpenClientId(null); load(); }}
          />
        );
      })()}
    </div>
  );
}