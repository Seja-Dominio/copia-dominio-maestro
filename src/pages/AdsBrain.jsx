import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, CheckCircle2, ChevronDown,
  Facebook, Plus, RefreshCw,
  ShieldCheck, Sparkles, WalletCards, AlertCircle, Star, ChevronUp, ExternalLink,
  Pin, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invokeSupabaseFunction } from "@/api/supabaseClient";

const channels = [
  { name: "Meta Ads", icon: Facebook, color: "text-blue-600", bg: "bg-blue-50", status: "Conectado", accounts: 0 },
  { name: "Google Ads", icon: BarChart3, color: "text-amber-600", bg: "bg-amber-50", status: "Aguardando conexão", accounts: 0 },
  { name: "TikTok Ads", icon: Activity, color: "text-slate-900", bg: "bg-slate-100", status: "Aguardando conexão", accounts: 0 },
];

const SYNC_INTERVAL_HOURS = 3;
const periodOptions = ["Hoje", "Ontem", "Hoje e ontem", "Últimos 7 dias", "Últimos 14 dias", "Últimos 28 dias", "Últimos 30 dias", "Esta semana", "Semana passada", "Este mês", "Mês passado", "Máximo", "Personalizado"];
const scoreCardTones = {
  5: "border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-card shadow-[0_8px_24px_rgba(217,119,6,0.16)]",
  4: "border-amber-200 bg-gradient-to-br from-amber-50/80 via-card to-card shadow-[0_6px_18px_rgba(217,119,6,0.11)]",
  3: "border-amber-100 bg-gradient-to-br from-amber-50/50 via-card to-card",
  2: "border-yellow-100 bg-gradient-to-br from-yellow-50/35 via-card to-card",
  1: "border-amber-100/70 bg-gradient-to-br from-amber-50/20 via-card to-card",
};

const metricCatalog = [
  { label: "CTR", key: "ctr", target: 1.5, unit: "%", direction: "above" },
  { label: "CPA", key: "cpa", target: 45, unit: "R$", direction: "below" },
  { label: "ROAS", key: "roas", target: 3, unit: "x", direction: "above" },
  { label: "Frequência", key: "frequency", target: 4, unit: "x", direction: "below" },
  { label: "Conversões", key: "conversions", target: 100, unit: "", direction: "above" },
  { label: "CPC", key: "cpc", target: 2, unit: "R$", direction: "below" },
  { label: "Impressões", key: "impressions", target: 10000, unit: "", direction: "above" },
  { label: "Taxa de conversão", key: "conversionRate", target: 2, unit: "%", direction: "above" },
  { label: "Alcance", key: "reach", target: 10000, unit: "", direction: "above" },
  { label: "CPM", key: "cpm", target: 20, unit: "R$", direction: "below" },
  { label: "Cliques no link", key: "link_clicks", target: 100, unit: "", direction: "above" },
  { label: "Custo por resultado", key: "cost_per_result", target: 10, unit: "R$", direction: "below" },
  { label: "Resultados", key: "results", target: 10, unit: "", direction: "above" },
  { label: "Visualizações de vídeo", key: "video_views", target: 1000, unit: "", direction: "above" },
  { label: "Compras", key: "purchases", target: 10, unit: "", direction: "above" },
  { label: "Valor de conversão", key: "conversion_value", target: 1000, unit: "R$", direction: "above" },
];

const networkMetricKeys = {
  "Meta Ads": ["ctr", "cpa", "roas", "frequency", "reach", "impressions", "conversionRate"],
  "Google Ads": ["ctr", "cpa", "roas", "conversions", "cpc", "impressions", "conversionRate"],
  "TikTok Ads": ["ctr", "cpa", "roas", "frequency", "reach", "videoViews", "conversionRate"],
};

function MetricPicker({ catalog, metricKey, setMetricKey, target, setTarget, weight, setWeight, onAdd }) {
  return <div className="rounded-lg border p-4"><div className="grid gap-3 sm:grid-cols-[1fr_110px_90px_auto]"><label className="text-xs font-medium text-muted-foreground">Métrica<select value={metricKey} onChange={(event) => { const next = catalog.find((item) => item.key === event.target.value); setMetricKey(event.target.value); if (next) setTarget(next.target); }} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground">{catalog.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label><label className="text-xs font-medium text-muted-foreground">Meta<input type="number" value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" /></label><label className="text-xs font-medium text-muted-foreground">Peso<input type="number" min="1" max="10" value={weight} onChange={(event) => setWeight(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" /></label><Button type="button" className="self-end" onClick={onAdd}><Plus className="mr-1 h-4 w-4" /> Incluir</Button></div></div>;
}

function MetricList({ metrics, onRemove }) {
  if (!metrics.length) return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma métrica incluída. O score será configurado somente com as métricas escolhidas acima.</p>;
  return <div className="space-y-2">{metrics.map((metric) => <div key={metric.key} className="flex items-center justify-between gap-3 rounded-lg border p-3"><div><p className="text-sm font-medium">{metric.label}</p><p className="text-xs text-muted-foreground">Meta: {metric.target}{metric.unit} · Peso: {metric.weight}/10</p></div><Button type="button" size="sm" variant="ghost" onClick={() => onRemove(metric.key)}>Remover</Button></div>)}</div>;
}

function AccountMetrics({ account }) {
  const raw = account.metrics || {};
  const conversions = raw.actions?.purchase ?? raw.actions?.lead ?? raw.actions?.offsite_conversion ?? 0;
  const spend = Number(raw.spend || 0);
  const monthlySpend = Number(account.monthlySpend || 0);
  const values = [
    ["Investimento", spend, "money"], ["Impressões", raw.impressions], ["Alcance", raw.reach],
    ["Cliques", raw.clicks], ["CTR", raw.ctr, "%"], ["CPC", raw.cpc, "money"],
    ["CPM", raw.cpm, "money"], ["Frequência", raw.frequency], ["Conversões", conversions],
    ["CPA", conversions ? spend / conversions : null, "money"], ["ROAS", raw.purchase_roas?.[0]?.value, "x"],
    ["Valor gasto total", account.amountSpent, "money"],
  ];
  const format = (value, type) => {
    if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
    if (type === "money") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value))}${type || ""}`;
  };
  const hasCardLimit = account.paymentMethod === "credit_card" && Number.isFinite(account.spendingLimit) && account.spendingLimit > 0;
  const hasMonthlySpend = Number.isFinite(account.monthlySpend);
  const limitProgress = hasCardLimit && hasMonthlySpend ? Math.min(100, (monthlySpend / account.spendingLimit) * 100) : 0;
  return <div>{hasCardLimit && <div className="mb-4 rounded-lg border p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">Gasto no mês</span><span>{hasMonthlySpend ? format(monthlySpend, "money") : "—"} de {format(account.spendingLimit, "money")}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${limitProgress >= 100 ? "bg-red-500" : limitProgress >= 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${limitProgress}%` }} /></div><p className="mt-1 text-right text-[11px] text-muted-foreground">{hasMonthlySpend ? `${Math.round(limitProgress)}% do limite` : "Aguardando sincronização mensal"}</p></div>}<p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Métricas da conta</p><div className="grid grid-cols-2 gap-2">{values.map(([label, value, type]) => <div key={label} className="rounded-lg border p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-sm font-semibold">{format(value, type)}</p></div>)}</div>{account.lastSyncedAt && <p className="mt-2 text-[11px] text-muted-foreground">Atualizado em {new Date(account.lastSyncedAt).toLocaleString("pt-BR")}</p>}</div>;
}

function CampaignTable({ campaigns = [], accountId }) {
  const storageKey = `ads-brain:campaign-preferences:${accountId}`;
  const [preferences, setPreferences] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : { pinnedIds: [], order: [], sort: "manual" };
    } catch {
      return { pinnedIds: [], order: [], sort: "manual" };
    }
  });
  const activeCampaigns = campaigns.filter((campaign) => (campaign.effective_status || campaign.status) === "ACTIVE");

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [preferences, storageKey]);

  const updatePreferences = (update) => setPreferences((current) => ({ ...current, ...update }));
  const togglePinned = (campaignId) => {
    const pinnedIds = preferences.pinnedIds.includes(campaignId)
      ? preferences.pinnedIds.filter((id) => id !== campaignId)
      : [...preferences.pinnedIds, campaignId];
    updatePreferences({ pinnedIds });
  };
  const moveCampaign = (campaignId, direction) => {
    const currentOrder = activeCampaigns
      .map((campaign) => campaign.id)
      .sort((left, right) => {
        const leftIndex = preferences.order.indexOf(left);
        const rightIndex = preferences.order.indexOf(right);
        return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
      });
    const index = currentOrder.indexOf(campaignId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= currentOrder.length) return;
    [currentOrder[index], currentOrder[nextIndex]] = [currentOrder[nextIndex], currentOrder[index]];
    updatePreferences({ order: currentOrder, sort: "manual" });
  };
  const orderedCampaigns = [...activeCampaigns].sort((left, right) => {
    const leftPinned = preferences.pinnedIds.includes(left.id) ? 0 : 1;
    const rightPinned = preferences.pinnedIds.includes(right.id) ? 0 : 1;
    if (leftPinned !== rightPinned) return leftPinned - rightPinned;
    if (preferences.sort === "name") return String(left.name || "").localeCompare(String(right.name || ""), "pt-BR");
    if (preferences.sort === "spend") return Number(right.insights?.data?.[0]?.spend || 0) - Number(left.insights?.data?.[0]?.spend || 0);
    if (preferences.sort === "ctr") return Number(right.insights?.data?.[0]?.ctr || 0) - Number(left.insights?.data?.[0]?.ctr || 0);
    const leftIndex = preferences.order.indexOf(left.id);
    const rightIndex = preferences.order.indexOf(right.id);
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex);
  });
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Fixe as campanhas importantes para mantê-las no topo.</p><label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Organizar<select aria-label="Organizar campanhas" value={preferences.sort} onChange={(event) => updatePreferences({ sort: event.target.value })} className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"><option value="manual">Manual</option><option value="name">Nome A–Z</option><option value="spend">Maior investimento</option><option value="ctr">Maior CTR</option></select></label></div><div className="max-h-[340px] overflow-auto rounded-lg border"><table className="w-full min-w-[760px] text-left text-xs"><thead className="sticky top-0 z-10 bg-muted text-muted-foreground"><tr><th className="w-20 p-3">Fixar</th><th className="p-3">Campanha</th><th className="p-3">Investimento</th><th className="p-3">Impressões</th><th className="p-3">Cliques</th><th className="p-3">CTR</th><th className="p-3">Status</th><th className="w-20 p-3">Ordem</th></tr></thead><tbody>{orderedCampaigns.length ? orderedCampaigns.map((campaign, index) => { const insight = campaign.insights?.data?.[0] || {}; const pinned = preferences.pinnedIds.includes(campaign.id); return <tr key={campaign.id} className={`h-[60px] border-t ${pinned ? "bg-primary/5" : ""}`}><td className="p-3"><button type="button" aria-label={pinned ? `Desafixar ${campaign.name}` : `Fixar ${campaign.name}`} title={pinned ? "Desafixar campanha" : "Fixar campanha"} onClick={(event) => { event.stopPropagation(); togglePinned(campaign.id); }} className={`rounded-md p-1.5 transition-colors ${pinned ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Pin className={`h-4 w-4 ${pinned ? "fill-current" : ""}`} /></button></td><td className="p-3 font-medium">{campaign.name}</td><td className="p-3">{insight.spend ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(insight.spend)) : "—"}</td><td className="p-3">{insight.impressions ? Number(insight.impressions).toLocaleString("pt-BR") : "—"}</td><td className="p-3">{insight.clicks ? Number(insight.clicks).toLocaleString("pt-BR") : "—"}</td><td className="p-3">{insight.ctr ? `${Number(insight.ctr).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "—"}</td><td className="p-3">Ativa</td><td className="p-3"><div className="flex items-center gap-1"><button type="button" aria-label={`Mover ${campaign.name} para cima`} title="Mover para cima" disabled={index === 0} onClick={(event) => { event.stopPropagation(); moveCampaign(campaign.id, -1); }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" aria-label={`Mover ${campaign.name} para baixo`} title="Mover para baixo" disabled={index === orderedCampaigns.length - 1} onClick={(event) => { event.stopPropagation(); moveCampaign(campaign.id, 1); }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button></div></td></tr>; }) : <tr><td className="p-3 text-muted-foreground" colSpan="8">Nenhuma campanha ativa para o período.</td></tr>}</tbody></table></div></div>;
}

export default function AdsBrain() {
  const [clientAccounts, setClientAccounts] = useState([]);
  const [period, setPeriod] = useState("Últimos 7 dias");
  const [customSince, setCustomSince] = useState("");
  const [customUntil, setCustomUntil] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState("Todos os canais");
  const [expandedClient, setExpandedClient] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);
  const [editingNetwork, setEditingNetwork] = useState("Meta Ads");
  const [editingMetrics, setEditingMetrics] = useState({});
  const [editingMinimumBalance, setEditingMinimumBalance] = useState("");
  const [editingSpendingLimit, setEditingSpendingLimit] = useState("");
  const [editingClientName, setEditingClientName] = useState("");
  const [editingNotice, setEditingNotice] = useState("");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionNetwork, setConnectionNetwork] = useState("Meta Ads");
  const [connectionClient, setConnectionClient] = useState("");
  const [connectionStep, setConnectionStep] = useState("authorize");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [criteriaAccountIndex, setCriteriaAccountIndex] = useState(0);
  const [authorizationId, setAuthorizationId] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState({});
  const [metricToAdd, setMetricToAdd] = useState("ctr");
  const [metricWeight, setMetricWeight] = useState(1);
  const [metricTarget, setMetricTarget] = useState(1);
  const [connectionMinimumBalance, setConnectionMinimumBalance] = useState("");
  const [savingConnection, setSavingConnection] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const normalizeStoredAccount = (account) => {
    const billing = account.metrics_data?.billing_sync || {};
    const paymentMethod = billing.payment_method || (billing.is_prepay_account === true ? "prepaid" : billing.is_prepay_account === false ? "credit_card" : "unknown");
    return ({
    id: account.id,
    name: account.display_name,
    clientName: account.client_name,
    accountName: account.external_account_name,
    externalAccountId: account.external_account_id,
    authorizationId: account.authorization_id,
    platform: account.network,
    balance: paymentMethod === "prepaid"
      ? account.balance == null ? "Saldo disponível não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: account.currency || "BRL" }).format(Number(account.balance))
      : paymentMethod === "credit_card"
        ? `Cobrança por cartão · ${account.balance == null ? "sem valor pendente" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: account.currency || "BRL" }).format(Number(account.balance))}`
        : account.balance == null ? "Valor pendente não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: account.currency || "BRL" }).format(Number(account.balance)),
    balanceValue: account.balance == null ? null : Number(account.balance),
    minimumBalance: account.minimum_balance == null ? null : Number(account.minimum_balance),
    spendingLimit: account.spending_limit == null ? null : Number(account.spending_limit),
    currency: account.currency || "BRL",
    amountSpent: account.amount_spent,
    monthlySpend: Number.isFinite(Number(billing.monthly_spend)) ? Number(billing.monthly_spend) : null,
    metrics: account.metrics_data || {},
    campaigns: account.campaigns_data || [],
    lastSyncedAt: account.last_synced_at,
    metricsConfig: account.metrics_config || [],
    paymentMethod,
    fundingSourceDisplay: billing.funding_source_display || "",
    });
  };

  useEffect(() => {
    const completeMetaOAuth = ({ code, state, error }) => {
      setConnectionOpen(true);
      setConnectionStep("select");
      if (error) {
        setConnectionNotice(`A autorização da Meta não foi concluída: ${error}`);
        return;
      }
      setConnectionNotice("Autorização concluída. Buscando suas contas de anúncios...");
      invokeSupabaseFunction("meta-ads-oauth", { action: "complete", code, state })
        .then((response) => {
          const accounts = response.accounts || [];
          setAvailableAccounts(accounts);
          setAuthorizationId(response.authorization_id || "");
          setSelectedAccountIds([]);
          setCriteriaAccountIndex(0);
          setConnectionNotice(accounts.length ? "Contas encontradas. Selecione uma ou mais contas ainda não cadastradas." : "Nenhuma conta de anúncios foi encontrada para este acesso.");
        })
        .catch((oauthError) => setConnectionNotice(oauthError.message || "Não foi possível consultar as contas da Meta."));
    };
    const handleOAuthMessage = (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== "maestro-meta-oauth") return;
      completeMetaOAuth(event.data);
    };
    window.addEventListener("message", handleOAuthMessage);
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error_description") || params.get("error");
    if (!code && !error) return () => window.removeEventListener("message", handleOAuthMessage);
    window.history.replaceState({}, "", window.location.pathname);
    if (window.opener) {
      window.opener.postMessage({ type: "maestro-meta-oauth", code, state, error }, window.location.origin);
      window.close();
    } else completeMetaOAuth({ code, state, error });
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, []);

  useEffect(() => {
    invokeSupabaseFunction("meta-ads-oauth", { action: "list" })
      .then((response) => setClientAccounts((response.accounts || []).map(normalizeStoredAccount)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const open = Boolean(connectionOpen || editingAccount);
    window.dispatchEvent(new CustomEvent("maestro:drawer-state", { detail: { source: "ads-brain", open } }));
    return () => window.dispatchEvent(new CustomEvent("maestro:drawer-state", { detail: { source: "ads-brain", open: false } }));
  }, [connectionOpen, editingAccount]);

  const scoreRules = Object.values(selectedMetrics);
  const toggleMetric = (metric) => setSelectedMetrics((current) => {
    const next = { ...current };
    if (next[metric.key]) delete next[metric.key];
    else next[metric.key] = { ...metric, weight: 1 };
    return next;
  });
  const updateWeight = (key, weight) => setSelectedMetrics((current) => ({ ...current, [key]: { ...current[key], weight: Math.max(1, Math.min(10, Number(weight) || 1)) } }));
  const addMetric = (setter = setSelectedMetrics) => {
    const metric = metricCatalog.find((item) => item.key === metricToAdd);
    if (!metric) return;
    setter((current) => ({ ...current, [metric.key]: { ...metric, target: Number(metricTarget) || metric.target, weight: Math.max(1, Math.min(10, Number(metricWeight) || 1)) } }));
  };
  const notifyAdsBrainDrawer = (open) => window.dispatchEvent(new CustomEvent("maestro:drawer-state", { detail: { source: "ads-brain", open } }));
  const openMetricEditor = (client, network = "Meta Ads") => {
    notifyAdsBrainDrawer(true);
    setEditingAccount(client || { name: "Novo cliente" });
    setEditingNetwork(network);
    setEditingMetrics(Object.fromEntries((client?.metricsConfig || []).map((metric) => [metric.key, metric])));
    setEditingMinimumBalance(client?.minimumBalance ?? "");
    setEditingSpendingLimit(client?.spendingLimit ?? "");
    setEditingClientName(client?.clientName || client?.accountName || "");
    setEditingNotice("");
  };
  const editorCatalog = Object.values(editingMetrics);
  const calculateHealthScore = (metrics = {}, rules = scoreRules) => {
    if (!rules.length) return 0;
    const totalWeight = rules.reduce((sum, rule) => sum + rule.weight, 0);
    const weightedScore = rules.reduce((sum, rule) => {
      const value = Number(metrics[rule.key]);
      if (!Number.isFinite(value) || !rule.target) return sum;
      const ratio = rule.direction === "above" ? value / rule.target : rule.target / value;
      return sum + Math.min(1, Math.max(0, ratio)) * rule.weight;
    }, 0);
    return Math.max(1, Math.min(5, Math.round((weightedScore / totalWeight) * 5)));
  };

  const filteredChannels = useMemo(() => selectedChannel === "Todos os canais"
    ? channels
    : channels.filter((channel) => channel.name === selectedChannel), [selectedChannel]);
  const visibleClientAccounts = useMemo(() => selectedChannel === "Todos os canais"
    ? clientAccounts
    : clientAccounts.filter((account) => account.platform.split(" + ").includes(selectedChannel)), [clientAccounts, selectedChannel]);
  const selectedConnectionAccounts = useMemo(
    () => availableAccounts.filter((account) => selectedAccountIds.includes(account.id) && !clientAccounts.some((saved) => saved.platform === connectionNetwork && String(saved.externalAccountId).replace(/^act_/, "") === String(account.id).replace(/^act_/, ""))),
    [availableAccounts, clientAccounts, connectionNetwork, selectedAccountIds],
  );
  const currentCriteriaAccount = selectedConnectionAccounts[criteriaAccountIndex] || null;
  const existingAvailableAccounts = useMemo(
    () => availableAccounts.map((account) => ({
      account,
      saved: clientAccounts.find((saved) => saved.platform === connectionNetwork && String(saved.externalAccountId).replace(/^act_/, "") === String(account.id).replace(/^act_/, "")),
    })).filter((item) => item.saved),
    [availableAccounts, clientAccounts, connectionNetwork],
  );
  const lowBalanceAccounts = useMemo(() => visibleClientAccounts.filter((account) =>
    Number.isFinite(account.balanceValue) && Number.isFinite(account.minimumBalance) && account.balanceValue < account.minimumBalance
  ), [visibleClientAccounts]);

  const sync = async (selectedPeriod = period, since = customSince, until = customUntil) => {
    setSyncing(true);
    try {
      await invokeSupabaseFunction("meta-ads-oauth", { action: "sync", period: selectedPeriod, since, until });
      const response = await invokeSupabaseFunction("meta-ads-oauth", { action: "list" });
      setClientAccounts((response.accounts || []).map(normalizeStoredAccount));
      setLastSync(new Date());
    } catch (error) {
      setConnectionNotice(error.message || "Não foi possível sincronizar as contas.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      sync(period);
    }, SYNC_INTERVAL_HOURS * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [period]);

  const openConnection = (network = "Meta Ads") => {
    notifyAdsBrainDrawer(true);
    setConnectionNetwork(network);
    setConnectionNotice("");
    setConnectionStep("authorize");
    setAvailableAccounts([]);
    setSelectedAccountIds([]);
    setCriteriaAccountIndex(0);
    setAuthorizationId("");
    setConnectionClient("");
    setConnectionMinimumBalance("");
    setSelectedMetrics({});
    setConnectionOpen(true);
  };
  const startCriteria = () => {
    const firstAccount = selectedConnectionAccounts[0];
    if (!firstAccount) return;
    setCriteriaAccountIndex(0);
    setConnectionClient(firstAccount.name || "");
    setConnectionMinimumBalance("");
    setSelectedMetrics({});
    setConnectionStep("criteria");
    setConnectionNotice(`Configure os critérios para ${firstAccount.name || "a conta selecionada"}.`);
  };
  const toggleConnectionAccount = (accountId) => {
    setSelectedAccountIds((current) => current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId]);
  };
  const toggleAllConnectionAccounts = () => {
    const selectableIds = availableAccounts
      .filter((account) => !clientAccounts.some((saved) => saved.platform === connectionNetwork && String(saved.externalAccountId).replace(/^act_/, "") === String(account.id).replace(/^act_/, "")))
      .map((account) => account.id);
    setSelectedAccountIds((current) => selectableIds.length > 0 && current.length === selectableIds.length ? [] : selectableIds);
  };
  const removeConnectedAccount = async (savedAccount, availableAccountId) => {
    if (!savedAccount?.id || !window.confirm(`Remover ${savedAccount.accountName || savedAccount.name || "esta conta"} do Ads Brain?`)) return;
    setConnectionNotice("Removendo a conta do Ads Brain...");
    try {
      await invokeSupabaseFunction("meta-ads-oauth", { action: "remove", account_id: savedAccount.id });
      setClientAccounts((current) => current.filter((account) => account.id !== savedAccount.id));
      setSelectedAccountIds((current) => current.includes(availableAccountId) ? current : [...current, availableAccountId]);
      setConnectionNotice("Conta removida. Ela já pode ser selecionada para um novo vínculo.");
    } catch (error) {
      setConnectionNotice(error.message || "Não foi possível remover a conta do Ads Brain.");
    }
  };
  const saveConnection = async () => {
    if (savingConnection) return;
    const account = selectedConnectionAccounts[criteriaAccountIndex];
    const clientName = connectionClient.trim() || account?.name?.trim() || "";
    if (!clientName) {
      setConnectionNotice("Informe o nome do cliente antes de salvar.");
      return;
    }
    setSavingConnection(true);
    setConnectionNotice("Salvando conta no Maestro...");
    try {
      const response = await invokeSupabaseFunction("meta-ads-oauth", {
        action: "save", authorization_id: authorizationId, account,
        client_name: clientName, minimum_balance: connectionMinimumBalance, metrics: Object.values(selectedMetrics),
      });
      setClientAccounts((current) => {
        const saved = normalizeStoredAccount(response.account);
        return [saved, ...current.filter((item) => item.id !== saved.id)];
      });
      const nextIndex = criteriaAccountIndex + 1;
      if (nextIndex < selectedConnectionAccounts.length) {
        const nextAccount = selectedConnectionAccounts[nextIndex];
        setCriteriaAccountIndex(nextIndex);
        setConnectionClient(nextAccount.name || "");
        setConnectionMinimumBalance("");
        setSelectedMetrics({});
        setConnectionNotice(`Conta salva (${nextIndex} de ${selectedConnectionAccounts.length}). Configure os critérios para ${nextAccount.name || "a próxima conta"}.`);
      } else {
        setConnectionOpen(false);
      }
    } catch (error) {
      setConnectionNotice(error.message || "Não foi possível salvar a conta no Maestro.");
    } finally {
      setSavingConnection(false);
    }
  };
  const saveEditingMetrics = async () => {
    if (savingEdit) return;
    if (!editingAccount?.id) return setEditingAccount(null);
    const clientName = editingClientName.trim();
    if (!clientName) {
      setEditingNotice("Informe o nome do cliente antes de salvar.");
      return;
    }
    setSavingEdit(true);
    setEditingNotice("Salvando alterações...");
    try {
      const response = await invokeSupabaseFunction("meta-ads-oauth", { action: "update_account", account_id: editingAccount.id, client_name: clientName, minimum_balance: editingMinimumBalance, spending_limit: editingSpendingLimit, metrics: Object.values(editingMetrics) });
      setClientAccounts((current) => current.map((account) => account.id === editingAccount.id ? normalizeStoredAccount(response.account) : account));
      setEditingAccount(null);
    } catch (error) {
      setEditingNotice(error.message || "Não foi possível salvar as alterações.");
    } finally {
      setSavingEdit(false);
    }
  };
  const submitConnection = async (event) => {
    event.preventDefault();
    setConnectionNotice("Abrindo a autorização segura da Meta...");
    try {
      if (connectionNetwork !== "Meta Ads") {
        setConnectionNotice(`O conector de ${connectionNetwork} será configurado em seguida.`);
        return;
      }
      const response = await invokeSupabaseFunction("meta-ads-oauth", { action: "start", client: connectionClient });
      const popup = window.open(response.authorization_url, "maestro-meta-auth", "width=560,height=720,resizable=yes,scrollbars=yes");
      if (!popup) setConnectionNotice("Permita janelas pop-up para concluir a autenticação da Meta.");
    } catch (error) {
      setConnectionNotice(error.message || "Não foi possível iniciar a conexão com a Meta.");
    }
  };

  return (
    <div className="min-h-full bg-muted/20 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-4 w-4" /> Inteligência de mídia paga
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Ads Brain</h1>
            <p className="mt-1 text-sm text-muted-foreground">O centro de decisão das campanhas dos seus clientes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="hidden items-center gap-2 rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground md:flex"><RefreshCw className="h-3.5 w-3.5 text-primary" /> Sincronização automática a cada {SYNC_INTERVAL_HOURS}h</div>
            <Button variant="outline" className="gap-2" onClick={() => sync()} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar dados"}
            </Button>
            <Button className="gap-2" onClick={() => openConnection()}><Plus className="h-4 w-4" /> Conectar conta</Button>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div><h2 className="text-lg font-semibold">Resumo dos clientes</h2><p className="text-sm text-muted-foreground">Saldo consolidado, saúde e canais de anúncios por cliente.</p></div>
          <div className="flex flex-wrap gap-2"><label className="flex min-h-0 min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">Período<select aria-label="Período do relatório" value={period} onChange={(e) => { const nextPeriod = e.target.value; setPeriod(nextPeriod); if (nextPeriod !== "Personalizado") sync(nextPeriod); }} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground">{periodOptions.map((option) => <option key={option}>{option}</option>)}</select></label>{period === "Personalizado" && <><label className="flex min-h-0 min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">De<input type="date" value={customSince} onChange={(event) => setCustomSince(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" /></label><label className="flex min-h-0 min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">Até<input type="date" value={customUntil} onChange={(event) => setCustomUntil(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" /></label><Button type="button" variant="outline" className="self-end" disabled={!customSince || !customUntil || customSince > customUntil || syncing} onClick={() => sync("Personalizado", customSince, customUntil)}>Aplicar</Button></>}<label className="flex min-h-0 min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">Canal<select aria-label="Canal de anúncios" value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"><option>Todos os canais</option>{channels.map((c) => <option key={c.name}>{c.name}</option>)}</select></label></div>
        </div>

        <div aria-live="polite" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Airbyte conectado</span><span>Próxima atualização automática em até {SYNC_INTERVAL_HOURS} horas</span><span>{syncing ? "Sincronização em andamento" : lastSync ? `Última sincronização manual: ${lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Nenhuma sincronização manual neste navegador"}</span></div>

        {lowBalanceAccounts.length > 0 && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><p className="font-semibold">Atenção: saldo abaixo do mínimo</p><p className="mt-1 text-sm text-amber-800">{lowBalanceAccounts.length === 1 ? "Uma conta precisa de recarga." : `${lowBalanceAccounts.length} contas precisam de recarga.`}</p><div className="mt-2 flex flex-wrap gap-2">{lowBalanceAccounts.map((account) => <button key={account.id} type="button" onClick={() => setExpandedClient(account.id)} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900">{account.name}: {account.balance} de mínimo {new Intl.NumberFormat("pt-BR", { style: "currency", currency: account.currency }).format(account.minimumBalance)}</button>)}</div></div></div></div>}

        {clientAccounts.length === 0 ? (
          <Card><CardContent className="flex min-h-44 flex-col items-center justify-center p-8 text-center"><div className="mb-3 rounded-full bg-muted p-3"><WalletCards className="h-6 w-6 text-muted-foreground" /></div><h3 className="font-semibold">Nenhuma conta de cliente conectada</h3><p className="mt-1 max-w-lg text-sm text-muted-foreground">Ainda não há contas vinculadas a clientes. Depois da conexão, você verá saldo por conta, saúde em estrelas, campanhas e métricas completas.</p><Button className="mt-4 gap-2" onClick={() => openConnection()}><Plus className="h-4 w-4" /> Conectar primeira conta</Button></CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleClientAccounts.map((client) => {
              const expanded = expandedClient === client.id;
              const score = calculateHealthScore(client.metrics, client.metricsConfig);
              const scoreCardTone = scoreCardTones[score] || "border-border bg-card";
              const accountNames = client.platform.split(" + ");
              const monthlySpend = Number.isFinite(client.monthlySpend) ? client.monthlySpend : null;
              const cardSpending = client.paymentMethod === "credit_card" && Number.isFinite(client.spendingLimit)
                ? `${monthlySpend == null ? "Gasto mensal não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: client.currency }).format(monthlySpend)} de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: client.currency }).format(client.spendingLimit)}`
                : client.balance;
              const accounts = accountNames.map((platform, index) => ({ platform, name: `${client.accountName} · ${platform}`, balance: index === 0 ? cardSpending : "Saldo não informado", url: platform === "Meta Ads" ? `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${String(client.externalAccountId).replace(/^act_/, "")}` : "#" }));
              const allMetrics = metricCatalog.map((metric) => ({ ...metric, value: client.metrics?.[metric.key] }));
              return <Card key={client.id} role="button" tabIndex={0} aria-expanded={expanded} className={`cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${scoreCardTone}`} onClick={() => setExpandedClient(expanded ? null : client.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setExpandedClient(expanded ? null : client.id); } }}><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="text-base">{client.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">ID da conta: {client.externalAccountId}</p><p className="mt-1 text-xs text-muted-foreground">{accounts.length} conta{accounts.length !== 1 ? "s" : ""} conectada{accounts.length !== 1 ? "s" : ""}</p></div><div className="flex flex-col items-end gap-3"><div className="flex items-center gap-1" aria-label={`${score} de 5 estrelas`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`h-4 w-4 ${star <= score ? "fill-amber-400 text-amber-400" : "text-muted"}`} />)}</div><Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); openMetricEditor(client, client.platform.split(" + ")[0]); }}>Editar cliente</Button></div></CardHeader><CardContent className="space-y-4"><div className="flex items-end justify-between"><div><p className="text-xs text-muted-foreground">Contas de anúncios</p><div className="mt-2 flex flex-wrap gap-1.5">{accounts.map((account) => <span key={account.platform} className="rounded-full bg-muted px-2 py-1 text-xs">{account.platform}</span>)}</div></div><button type="button" aria-label={expanded ? `Recolher ${client.name}` : `Abrir ${client.name}`} onClick={(event) => { event.stopPropagation(); setExpandedClient(expanded ? null : client.id); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{expanded ? "Recolher" : "Abrir cliente"} {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div><div><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo por conta</p><div className="grid gap-2 sm:grid-cols-2">{accounts.map((account) => <div key={account.platform} className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-xs text-muted-foreground">{account.platform}</p><p className="font-semibold">{account.balance}</p></div><div className="flex items-center gap-3"><a href={account.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="flex items-center gap-1 text-xs font-medium text-primary no-underline">Abrir conta <ExternalLink className="h-3.5 w-3.5" /></a></div></div>)}</div></div>{expanded && <div className="space-y-5 border-t pt-4"><div><p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campanhas e métricas completas</p><CampaignTable campaigns={client.campaigns} accountId={client.id} /></div><AccountMetrics account={client} /><p className="flex items-center gap-1 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Score ponderado: {score}/5</p></div>}</CardContent></Card>;
            })}
          </div>
        )}

        <Card><CardHeader><CardTitle className="text-base">Configuração do score de saúde</CardTitle><p className="text-sm text-muted-foreground">As métricas são configuradas individualmente ao conectar ou editar cada conta.</p></CardHeader><CardContent><p className="text-sm text-muted-foreground">Nenhuma métrica é aplicada automaticamente. Em cada conta, escolha somente as métricas relevantes da rede, defina a meta e o peso de 1 a 10.</p></CardContent></Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {filteredChannels.map(({ name, icon: Icon, color, bg, status, accounts }) => {
            const connected = status === "Conectado";
            return <Card key={name} className="overflow-hidden"><CardHeader className="flex-row items-center justify-between space-y-0"><div className="flex items-center gap-3"><div className={`rounded-lg p-2 ${bg} ${color}`}><Icon className="h-5 w-5" /></div><CardTitle className="text-base">{name}</CardTitle></div><span className={`flex items-center gap-1 text-xs font-medium ${connected ? "text-emerald-600" : "text-muted-foreground"}`}>{connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}{status}</span></CardHeader><CardContent><div className="flex items-end justify-between"><div><p className="text-2xl font-bold">{accounts}</p><p className="text-xs text-muted-foreground">contas conectadas</p></div><Button size="sm" variant={connected ? "outline" : "default"} onClick={() => openConnection(name)}>{connected ? "Gerenciar" : "Conectar"}</Button></div></CardContent></Card>;
          })}
        </div>

        <Card><CardContent className="flex min-h-56 flex-col items-center justify-center p-8 text-center"><div className="mb-3 rounded-full bg-muted p-3"><BarChart3 className="h-6 w-6 text-muted-foreground" /></div><h3 className="font-semibold">Seu painel de performance aparecerá aqui</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Após conectar a primeira conta, o Ads Brain exibirá campanhas, gastos, saldo e oportunidades de otimização.</p><Button variant="link" className="mt-2">Conhecer o fluxo de dados <ChevronDown className="ml-1 h-4 w-4 -rotate-90" /></Button></CardContent></Card>
      </div>
      <Sheet open={Boolean(editingAccount)} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>Editar cliente</SheetTitle><SheetDescription>Atualize os dados, alertas e critérios de estrelas deste cliente.</SheetDescription></SheetHeader>
          <div className="mt-6 space-y-5 pb-24">
            <label className="block text-sm font-medium">Nome do cliente<input required value={editingClientName} onChange={(event) => setEditingClientName(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" placeholder="Nome do cliente" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Será exibido como: {(editingClientName.trim() || "Nome do cliente")} - {editingNetwork}</span></label>
            <label className="text-sm font-medium">Rede de anúncios<select value={editingNetwork} disabled className="mt-2 h-10 w-full rounded-md border bg-muted px-3"><option>{editingNetwork}</option></select></label>
            <label className="block text-sm font-medium">Saldo mínimo para alerta<input type="number" min="0" step="0.01" value={editingMinimumBalance} onChange={(event) => setEditingMinimumBalance(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" placeholder="Ex.: 500,00" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Deixe vazio para não gerar alerta de saldo nesta conta.</span></label>
            {editingAccount?.paymentMethod === "credit_card" && <label className="block text-sm font-medium">Limite de gastos<input type="number" min="0" step="0.01" value={editingSpendingLimit} onChange={(event) => setEditingSpendingLimit(event.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm" placeholder="Ex.: 1000,00" /><span className="mt-1 block text-xs font-normal text-muted-foreground">O gasto acumulado deste mês será comparado visualmente com este limite.</span></label>}
            <MetricPicker catalog={metricCatalog} metricKey={metricToAdd} setMetricKey={setMetricToAdd} target={metricTarget} setTarget={setMetricTarget} weight={metricWeight} setWeight={setMetricWeight} onAdd={() => addMetric(setEditingMetrics)} />
            <MetricList metrics={editorCatalog} onRemove={(key) => setEditingMetrics((current) => { const next = { ...current }; delete next[key]; return next; })} />
            {editingNotice && <p role="status" className="rounded-md bg-primary/10 p-3 text-sm text-primary">{editingNotice}</p>}
            <div className="sticky bottom-0 z-20 -mx-1 flex justify-end gap-2 border-t bg-background px-1 py-4"><Button type="button" variant="outline" onClick={() => setEditingAccount(null)} disabled={savingEdit}>Cancelar</Button><Button type="button" disabled={savingEdit || !editingClientName.trim()} onClick={saveEditingMetrics}>{savingEdit ? "Salvando..." : "Salvar alterações"}</Button></div>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={connectionOpen} onOpenChange={setConnectionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain pb-24 sm:max-w-2xl">
          <DialogHeader><DialogTitle>Conectar conta de anúncios</DialogTitle><DialogDescription>Informe o cliente e a rede. O próximo passo será a autorização segura da plataforma.</DialogDescription></DialogHeader>
          <form onSubmit={submitConnection} className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="ads-network">Rede<select id="ads-network" value={connectionNetwork} onChange={(event) => setConnectionNetwork(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"><option>Meta Ads</option><option>Google Ads</option><option>TikTok Ads</option></select></label>
            {connectionStep === "select" && <div className="rounded-lg border border-dashed p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">Escolha as contas de anúncios</p><p className="mt-1 text-xs text-muted-foreground">Selecione várias contas para cadastrá-las em sequência.</p></div><button type="button" onClick={toggleAllConnectionAccounts} className="text-xs font-medium text-primary hover:underline">{availableAccounts.length > 0 && selectedAccountIds.length === availableAccounts.filter((account) => !existingAvailableAccounts.some((item) => item.account.id === account.id)).length ? "Limpar seleção" : "Selecionar todas"}</button></div>{existingAvailableAccounts.length > 0 && <div role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><p className="font-medium">Conta{existingAvailableAccounts.length === 1 ? " já ativa" : "s já ativas"} no Ads Brain</p><p className="mt-1 text-xs">A duplicação está bloqueada. Remova o vínculo abaixo para poder cadastrá-la novamente.</p><div className="mt-2 space-y-2">{existingAvailableAccounts.map(({ account, saved }) => <div key={account.id} className="flex items-center justify-between gap-3 rounded-md border border-destructive/20 bg-background p-2"><span className="min-w-0 truncate text-xs font-medium">{account.name}</span><Button type="button" size="sm" variant="outline" onClick={() => removeConnectedAccount(saved, account.id)} className="shrink-0 text-xs">Remover do Ads Brain</Button></div>)}</div></div>}<div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">{availableAccounts.map((account) => { const existing = existingAvailableAccounts.find((item) => item.account.id === account.id)?.saved; const checked = selectedAccountIds.includes(account.id) && !existing; return <div key={account.id} className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${checked ? "border-primary bg-primary/5" : existing ? "border-destructive/20 bg-muted/30" : "hover:bg-muted/50"}`}><label className={`flex min-w-0 flex-1 items-start gap-3 ${existing ? "cursor-not-allowed" : "cursor-pointer"}`}><input type="checkbox" disabled={Boolean(existing)} checked={checked} onChange={() => toggleConnectionAccount(account.id)} className="mt-0.5 h-4 w-4 accent-primary" /><span className="min-w-0 text-sm"><span className="block truncate font-medium">{account.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{account.id} · {account.currency}</span></span></label>{existing && <span className="shrink-0 text-[11px] font-medium text-destructive">Já ativa</span>}</div>; })}</div><p className="mt-3 text-xs font-medium text-muted-foreground">{selectedConnectionAccounts.length} conta{selectedConnectionAccounts.length === 1 ? " selecionada" : "s selecionadas"}</p></div>}
            {connectionStep === "criteria" && <div className="space-y-3"><div className="rounded-lg border border-primary/20 bg-primary/5 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-primary">Critérios da conta {criteriaAccountIndex + 1} de {selectedConnectionAccounts.length}</p><span className="text-xs text-muted-foreground">{currentCriteriaAccount?.id}</span></div><p className="mt-1 truncate text-sm font-medium">{currentCriteriaAccount?.name}</p><p className="mt-1 text-xs text-muted-foreground">Salve esta conta para avançar automaticamente para a próxima selecionada.</p></div><label className="block text-sm font-medium">Nome do cliente<input id="ads-client" required value={connectionClient} onChange={(event) => setConnectionClient(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" placeholder="Nome do perfil da conta" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Será salvo como: {(connectionClient.trim() || currentCriteriaAccount?.name || "Nome do cliente")} - {connectionNetwork}</span></label><label className="block text-sm font-medium">Saldo mínimo para alerta<input type="number" min="0" step="0.01" value={connectionMinimumBalance} onChange={(event) => setConnectionMinimumBalance(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" placeholder="Ex.: 500,00" /><span className="mt-1 block text-xs font-normal text-muted-foreground">Você poderá alterar esse valor depois em Editar.</span></label><div><p className="text-sm font-medium">Critérios de saúde da conta</p><p className="mt-1 text-xs text-muted-foreground">Inclua apenas as métricas da Meta que devem compor as estrelas desta conta.</p></div><MetricPicker catalog={metricCatalog} metricKey={metricToAdd} setMetricKey={setMetricToAdd} target={metricTarget} setTarget={setMetricTarget} weight={metricWeight} setWeight={setMetricWeight} onAdd={() => addMetric()} /><MetricList metrics={scoreRules} onRemove={(key) => setSelectedMetrics((current) => { const next = { ...current }; delete next[key]; return next; })} /></div>}
            {connectionNotice && <p role="status" className="rounded-md bg-primary/10 p-3 text-sm text-primary">{connectionNotice}</p>}
            <DialogFooter className="sticky bottom-0 z-20 -mx-6 border-t bg-background px-6 py-4"><Button type="button" variant="outline" onClick={() => setConnectionOpen(false)} disabled={savingConnection}>Cancelar</Button>{connectionStep === "authorize" ? <Button type="submit">Entrar e buscar contas</Button> : connectionStep === "select" ? <Button type="button" disabled={!selectedConnectionAccounts.length} onClick={startCriteria}>Continuar para critérios ({selectedConnectionAccounts.length})</Button> : <Button type="button" disabled={savingConnection || !(connectionClient.trim() || currentCriteriaAccount?.name?.trim()) || !authorizationId} onClick={saveConnection}>{savingConnection ? "Salvando..." : criteriaAccountIndex + 1 < selectedConnectionAccounts.length ? "Salvar e próxima conta" : "Salvar conta"}</Button>}</DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
