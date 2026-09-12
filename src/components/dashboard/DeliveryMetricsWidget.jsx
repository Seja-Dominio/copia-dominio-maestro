import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, ListChecks, Target } from "lucide-react";
import { createPageUrl } from "@/utils";
import { getCurrentMonthPeriod, calculateDeliveryMetrics } from "@/lib/deliveryMetrics";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";

function formatRate(rate) { return rate == null ? "—" : `${rate}%`; }

function Metric({ icon: Icon, label, value, detail, tone = "blue" }) {
  const tones = { red: "bg-red-50 text-red-600 dark:bg-red-950/20", amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/20", green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20", blue: "bg-primary/10 text-primary" };
  return <div className="min-w-0 rounded-xl border border-border bg-background/60 p-3" aria-label={`${label}: ${value}. ${detail}`}><div className="flex items-start gap-2"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}><Icon className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title={label}>{label}</p><p className="text-xl font-black leading-tight text-foreground">{value}</p></div></div><p className="mt-2 text-[11px] leading-4 text-muted-foreground">{detail}</p></div>;
}

export default function DeliveryMetricsWidget({ jobs = [], subtasks = [], collaborators = [], clients = [], todayStr }) {
  const currentPeriod = useMemo(() => getCurrentMonthPeriod(todayStr), [todayStr]);
  const previousPeriod = useMemo(() => {
    const today = new Date(`${todayStr}T12:00:00`);
    const date = subMonths(today, 1);
    return { start: format(startOfMonth(date), "yyyy-MM-dd"), end: format(endOfMonth(date), "yyyy-MM-dd") };
  }, [todayStr]);
  const [periodType, setPeriodType] = useState("current");
  const [customStart, setCustomStart] = useState(currentPeriod.start);
  const [customEnd, setCustomEnd] = useState(currentPeriod.end);
  const [customPeriod, setCustomPeriod] = useState(currentPeriod);
  const period = periodType === "current" ? currentPeriod : periodType === "previous" ? previousPeriod : customPeriod;
  const metrics = useMemo(() => calculateDeliveryMetrics({ jobs, subtasks, collaborators, clients, today: todayStr, period }), [jobs, subtasks, collaborators, clients, todayStr, period]);
  const activeCollaboratorIds = useMemo(() => new Set(collaborators.filter((collaborator) => collaborator.is_active === true).map((collaborator) => String(collaborator.id))), [collaborators]);
  const isVisibleResponsible = (id) => id === "__unassigned__" || activeCollaboratorIds.has(String(id));
  const topResponsible = metrics.responsibleRows.filter((row) => isVisibleResponsible(row.id)).slice(0, 8);
  const topStages = metrics.stageRows.filter((row) => isVisibleResponsible(row.responsibleId)).slice(0, 8);
  const reportUrl = (params = {}) => {
    const query = new URLSearchParams({ section: "jobs", report: "delivery", start: period.start, end: period.end, ...params });
    return `${createPageUrl("Reports")}?${query.toString()}`;
  };
  const periodLabel = periodType === "current" ? "mês atual" : periodType === "previous" ? "mês passado" : "período personalizado";

  return <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Target className="h-5 w-5" /></div><div><h3 className="text-sm font-bold text-foreground">Gestão de entregas</h3><p className="text-xs text-muted-foreground">Data de postagem, etapa e responsável · {periodLabel}</p></div></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Período da gestão de entregas" value={periodType} onChange={(event) => setPeriodType(event.target.value)} className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground"><option value="current">Este mês</option><option value="previous">Mês passado</option><option value="custom">Personalizado</option></select><a href={reportUrl()} className="flex items-center gap-1 text-xs font-semibold text-primary no-underline hover:underline">Ver relatório <ArrowRight className="h-3.5 w-3.5" /></a></div></div>
    {periodType === "custom" && <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/20 px-5 py-3"><label className="text-[11px] font-semibold text-muted-foreground">De<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="ml-1 block h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground" /></label><label className="text-[11px] font-semibold text-muted-foreground">Até<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="ml-1 block h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground" /></label><button type="button" disabled={!customStart || !customEnd || customStart > customEnd} onClick={() => setCustomPeriod({ start: customStart, end: customEnd })} className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Aplicar período</button></div>}
    <div className="grid gap-3 border-b border-border p-5 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
      <Metric icon={AlertTriangle} label="Jobs com postagem atrasada" value={metrics.totals.overdueJobs} detail={`${metrics.totals.activeJobs} jobs ativos no total`} tone={metrics.totals.overdueJobs ? "red" : "green"} />
      <Metric icon={ListChecks} label="Tarefas atrasadas" value={metrics.totals.overdueTasks} detail={`${metrics.totals.activeTasks} tarefas abertas`} tone={metrics.totals.overdueTasks ? "amber" : "green"} />
      <Metric icon={CheckCircle2} label="Entregas no prazo" value={formatRate(metrics.totals.onTimeRate)} detail={`${metrics.totals.onTimeTasks} de ${metrics.totals.completedTasks} tarefas com prazo`} tone="green" />
      <Metric icon={Clock3} label="Postagens nos próximos 5 dias" value={metrics.totals.upcomingNotScheduled} detail="postagens não agendadas" tone={metrics.totals.upcomingNotScheduled ? "amber" : "blue"} />
    </div>
    <div className="grid gap-5 p-5 lg:grid-cols-2"><div><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-bold text-foreground">Atrasos por responsável</h4><span className="text-[10px] text-muted-foreground">jobs · tarefas · no prazo</span></div>{topResponsible.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Nenhum dado de entrega no período.</p> : <div className="space-y-1.5">{topResponsible.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"><a href={reportUrl({ responsible: row.id })} aria-label={`Ver relatório de ${row.name}`} className="min-w-0 flex-1 truncate rounded-sm text-xs font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{row.name}</a><div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold"><span className="text-red-600">{row.overdueJobs} jobs</span><span className="text-amber-600">{row.overdueTasks} tarefas</span><span className="text-emerald-600">{formatRate(row.onTimeRate)}</span></div></div>)}</div>}</div><div><div className="mb-3 flex items-center justify-between"><h4 className="text-xs font-bold text-foreground">Atrasos por etapa</h4><span className="text-[10px] text-muted-foreground">responsável atual</span></div>{topStages.length === 0 ? <p role="status" className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Nenhuma etapa atrasada.</p> : <div className="space-y-1.5">{topStages.map((row) => <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"><div className="min-w-0 flex-1"><a href={reportUrl({ stage: row.stage, responsible: row.responsibleId === "__unassigned__" ? "" : row.responsibleId })} aria-label={`Ver relatório da etapa ${row.stage}`} className="block truncate rounded-sm text-xs font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{row.stage}</a><a href={reportUrl({ responsible: row.responsibleId === "__unassigned__" ? "" : row.responsibleId })} aria-label={`Ver relatório do responsável ${row.responsibleName}`} className="block truncate rounded-sm text-[10px] text-muted-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{row.responsibleName}</a></div><div className="shrink-0 text-right"><p className="text-xs font-bold text-red-600">{row.jobs} jobs</p><p className="text-[10px] text-muted-foreground">{row.ageDays}d de atraso</p></div></div>)}</div>}</div></div>
  </section>;
}
