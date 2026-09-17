import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, CheckCircle2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { invokeSupabaseFunction } from "@/api/supabaseClient";
import { getCurrentMonthPeriod } from "@/lib/deliveryMetrics";

const numberFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const moneyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}

function shiftDay(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function periodFromPreset(value) {
  const current = getCurrentMonthPeriod();
  if (value === "Últimos 7 dias") return { start: shiftDay(current.end, -6), end: current.end };
  if (value === "Últimos 30 dias") return { start: shiftDay(current.end, -29), end: current.end };
  return current;
}

function metricValue(value, type = "number") {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  if (type === "money") return moneyFormat.format(Number(value));
  if (type === "percent") return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return numberFormat.format(Number(value));
}

function variation(current, previous) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) return null;
  if (Number(previous) === 0) return Number(current) === 0 ? 0 : null;
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
}

function Variation({ current, previous, inverse = false }) {
  const delta = variation(current, previous);
  if (delta == null) return <span className="text-xs text-muted-foreground">sem base anterior</span>;
  const positive = inverse ? delta <= 0 : delta >= 0;
  const Icon = delta >= 0 ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${positive ? "text-emerald-600" : "text-red-600"}`}><Icon className="h-3.5 w-3.5" />{delta >= 0 ? "+" : ""}{delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>;
}

function MetricCard({ label, current, previous, type, inverse }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold text-foreground">{metricValue(current, type)}</p><div className="mt-1 flex items-center justify-between gap-2"><Variation current={current} previous={previous} inverse={inverse} /><span className="text-[11px] text-muted-foreground">anterior: {metricValue(previous, type)}</span></div></CardContent></Card>;
}

export default function PaidTrafficReport({ period }) {
  const [localPreset, setLocalPreset] = useState("Este mês");
  const localPeriod = useMemo(() => periodFromPreset(localPreset), [localPreset]);
  const effectivePeriod = period || localPeriod;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      const response = await invokeSupabaseFunction("meta-ads-oauth", {
        action: "report",
        since: effectivePeriod.start,
        until: effectivePeriod.end,
      });
      setData(response);
    } catch (loadError) {
      setError(loadError.message || "Não foi possível gerar o relatório de tráfego pago.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReport(); }, [effectivePeriod.start, effectivePeriod.end]);

  const okReports = (data?.reports || []).filter((item) => item.status === "ok");
  const totals = useMemo(() => {
    const sum = (key, periodKey) => okReports.reduce((total, item) => total + (Number(item[periodKey]?.[key]) || 0), 0);
    return {
      current: { spend: sum("spend", "current"), impressions: sum("impressions", "current"), clicks: sum("clicks", "current"), leads: sum("leads", "current") },
      previous: { spend: sum("spend", "previous"), impressions: sum("impressions", "previous"), clicks: sum("clicks", "previous"), leads: sum("leads", "previous") },
    };
  }, [okReports]);

  const competitiveReports = useMemo(() => (data?.reports || [])
    .filter((item) => item.competitive?.competitors?.some((competitor) => competitor.status === "ok")), [data]);
  const competitiveFailures = useMemo(() => (data?.reports || [])
    .filter((item) => item.competitive?.status === "error" || item.competitive?.competitors?.some((competitor) => competitor.status === "error")), [data]);

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" /> Consultando as contas oficiais...</div>;

  return <div className="space-y-5">
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><BarChart3 className="h-4 w-4" /> Tráfego pago</div><h2 className="mt-2 text-xl font-bold text-foreground">Relatório comparativo</h2><p className="mt-1 text-sm text-muted-foreground">{formatDate(effectivePeriod.start)} a {formatDate(effectivePeriod.end)} comparado com o período anterior de mesma duração.</p></div>
        {!period && <label className="text-xs font-semibold text-muted-foreground">Período<select aria-label="Período do relatório de tráfego pago" value={localPreset} onChange={(event) => setLocalPreset(event.target.value)} className="mt-1 h-9 rounded-lg border bg-background px-3 text-sm font-normal text-foreground"><option>Este mês</option><option>Últimos 7 dias</option><option>Últimos 30 dias</option></select></label>}
        <Button type="button" variant="outline" className="gap-2" onClick={loadReport}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Fonte oficial: {data?.source || "Meta Graph API"}</span><span>Período anterior: {formatDate(data?.previous_period?.since)} a {formatDate(data?.previous_period?.until)}</span></div>
    </div>

    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {!error && !okReports.length && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma conta com dados oficiais disponíveis neste período.</div>}

    {okReports.length > 0 && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Investimento" current={totals.current.spend} previous={totals.previous.spend} type="money" />
        <MetricCard label="Impressões" current={totals.current.impressions} previous={totals.previous.impressions} />
        <MetricCard label="Cliques" current={totals.current.clicks} previous={totals.previous.clicks} />
        <MetricCard label="Leads" current={totals.current.leads} previous={totals.previous.leads} />
      </div>

      <Card><CardHeader><CardTitle className="text-base">Contas por cliente</CardTitle></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-[820px] w-full text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Investimento</th><th className="px-4 py-3">Impressões</th><th className="px-4 py-3">Cliques</th><th className="px-4 py-3">Leads</th><th className="px-4 py-3">Variação do investimento</th></tr></thead><tbody>{okReports.map((item) => <tr key={item.id} className="border-t"><td className="px-4 py-3"><p className="font-semibold text-foreground">{item.client_name}</p><p className="text-xs text-muted-foreground">{item.network}</p></td><td className="px-4 py-3"><p className="font-medium">{metricValue(item.current.spend, "money")}</p><Variation current={item.current.spend} previous={item.previous.spend} /></td><td className="px-4 py-3">{metricValue(item.current.impressions)}</td><td className="px-4 py-3">{metricValue(item.current.clicks)}</td><td className="px-4 py-3">{metricValue(item.current.leads)}</td><td className="px-4 py-3"><Variation current={item.current.spend} previous={item.previous.spend} /></td></tr>)}</tbody></table></div></CardContent></Card>
    </>}

    {(data?.reports || []).some((item) => item.status !== "ok") && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-4 w-4" /> Algumas contas ficaram fora do comparativo</div><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{data.reports.filter((item) => item.status !== "ok").map((item) => <li key={item.id}>{item.client_name}: {item.error}</li>)}</ul></div>}

    <Card><CardHeader><CardTitle className="text-base">Comparação competitiva</CardTitle><p className="text-xs leading-5 text-muted-foreground">Benchmark público observado pela Meta Business Discovery. Não inclui alcance, impressões ou salvamentos privados de concorrentes.</p></CardHeader><CardContent className="p-0">{competitiveReports.length > 0 ? <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Cliente / perfil</th><th className="px-4 py-3">Seguidores</th><th className="px-4 py-3">Posts no período</th><th className="px-4 py-3">Engajamento observado</th><th className="px-4 py-3">Taxa observada</th></tr></thead><tbody>{competitiveReports.flatMap((item) => { const own = item.competitive.own; const rows = [{ key: `${item.id}-own`, label: `${item.client_name} (cliente)`, metrics: own, own: true }]; return rows.concat(item.competitive.competitors.filter((competitor) => competitor.status === "ok").map((competitor) => ({ key: `${item.id}-${competitor.id}`, label: `@${competitor.profile?.username || "—"}`, metrics: { followers: competitor.profile?.followers, posts: competitor.profile?.posts_in_period, engagement: competitor.profile?.engagement_in_period, engagement_rate: competitor.profile?.engagement_rate } }))); }).map((row) => <tr key={row.key} className={`border-t ${row.own ? "font-semibold" : ""}`}><td className="px-4 py-3">{row.label}</td><td className="px-4 py-3">{metricValue(row.metrics?.followers)}</td><td className="px-4 py-3">{metricValue(row.metrics?.posts)}</td><td className="px-4 py-3">{metricValue(row.metrics?.engagement)}</td><td className="px-4 py-3">{metricValue(row.metrics?.engagement_rate, "percent")}</td></tr>)}</tbody></table></div> : <div className="p-5 text-sm text-muted-foreground">Cadastre perfis concorrentes no bloco de Insights do cliente. A comparação aparecerá aqui quando houver uma autorização oficial do Instagram válida.</div>}{competitiveFailures.length > 0 && <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">Alguns perfis não puderam ser consultados pela autorização atual. Reconecte a conta do Instagram para completar o benchmark.</p>}</CardContent></Card>
  </div>;
}
