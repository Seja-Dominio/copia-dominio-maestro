import { useEffect, useState } from "react";
import { maestro, invokeMaestroFunction } from "@/api/maestroClient";
import { Button } from "@/components/ui/button";
import { BarChart3, Bot, CalendarClock, GripVertical, Pause, Play, RefreshCw, Save, Search, Send, ShieldCheck, Trash2, Users } from "lucide-react";

export const REPORT_METRICS = [
  { id: "overdue_posts", label: "Posts atrasados", description: "Jobs com data de postagem vencida e ainda não concluídos." },
  { id: "next_5_unplanned", label: "Próximos 5 dias sem agendamento", description: "Posts dos próximos cinco dias que ainda não foram agendados." },
  { id: "overdue_tasks", label: "Tarefas atrasadas", description: "Subtarefas vencidas que ainda estão pendentes." },
  { id: "today_posts", label: "Postagens de hoje", description: "Jobs com data de postagem marcada para hoje." },
  { id: "my_tasks", label: "Minhas tarefas", description: "Minhas mini tarefas que ainda estão abertas." },
  { id: "missing_content", label: "Jobs com briefing e/ou legenda vazio", description: "Jobs ativos que precisam de briefing, legenda ou dos dois." },
];
const WEEK_DAYS = [{ id: 1, label: "Seg" }, { id: 2, label: "Ter" }, { id: 3, label: "Qua" }, { id: 4, label: "Qui" }, { id: 5, label: "Sex" }, { id: 6, label: "Sáb" }, { id: 7, label: "Dom" }];

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus" }).format(new Date());
}

function plusDays(key, days) {
  const date = new Date(key + "T12:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateLabel(value) {
  return value ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR") : "sem data";
}

function weekdayLabel(item) {
  const ids = Array.isArray(item.weekdays) ? item.weekdays.map(Number) : [];
  return WEEK_DAYS.filter((day) => ids.includes(day.id)).map((day) => day.label).join(", ") || "dia definido";
}

function reportLine(id, row, jobs, clientNames) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const job = id === "overdue_tasks" ? jobsById.get(row.job_id) : id === "my_tasks" ? jobsById.get(row.job_id) : row;
  const client = clientNames.get(job?.client_id) || job?.client_name || "Cliente não identificado";
  const title = job?.title || (id === "my_tasks" ? "Sem job vinculado" : "Job sem título");
  const stage = id === "overdue_tasks"
    ? row.title || "Etapa não identificada"
    : row.stage_title || job?.stage_title || (id === "my_tasks" ? "Minha tarefa" : "Etapa não identificada");
  const responsible = id === "overdue_tasks"
    ? row.responsible_name || job?.stage_responsible_name || job?.responsible_name || "Sem responsável"
    : row.responsible_name || row.collaborator_name || row.stage_responsible_name || job?.stage_responsible_name || job?.responsible_name || "Sem responsável";
  const date = dateLabel(row.deadline || row.due_date || row.post_date || job?.post_date);
  const missing = id === "missing_content" ? " · faltando: " + [!String(row.briefing || "").trim() ? "briefing" : "", !String(row.caption || "").trim() ? "legenda" : ""].filter(Boolean).join(" e ") : "";
  return "• " + date + " · " + client + " · " + title + " · " + stage + " · " + responsible + missing;
}

function rowsForMetric(id, jobs, subtasks, myTasks = []) {
  const today = todayKey();
  const next = plusDays(today, 5);
  const excluded = ["completed", "scheduled", "cancelled"];
  if (id === "overdue_posts") return jobs.filter((job) => job.post_date && job.post_date <= today && !excluded.includes(job.status)).sort((a, b) => String(a.post_date).localeCompare(String(b.post_date)));
  if (id === "next_5_unplanned") return jobs.filter((job) => job.post_date && job.post_date > today && job.post_date <= next && !excluded.includes(job.status)).sort((a, b) => String(a.post_date).localeCompare(String(b.post_date)));
  if (id === "today_posts") return jobs.filter((job) => job.post_date === today && job.status !== "cancelled").sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  if (id === "my_tasks") return myTasks.filter((task) => !task.is_completed && task.status !== "completed").sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));
  if (id === "missing_content") return jobs.filter((job) => !excluded.includes(job.status) && (!String(job.briefing || "").trim() || !String(job.caption || "").trim())).sort((a, b) => String(a.post_date || "9999").localeCompare(String(b.post_date || "9999")));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  return subtasks.filter((task) => {
    const job = jobsById.get(task.job_id);
    const deadline = task.deadline || job?.post_date;
    return deadline && deadline <= today && !task.is_completed && task.status !== "completed" && job && !excluded.includes(job.status);
  }).sort((a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));
}

export function formatDashboardReport(metricIds, jobs, subtasks, clientNames, myTasks = []) {
  const sections = metricIds.map((id) => {
    const metric = REPORT_METRICS.find((item) => item.id === id);
    const rows = rowsForMetric(id, jobs, subtasks, myTasks);
    const lines = rows.map((row) => reportLine(id, row, jobs, clientNames));
    if (!rows.length) return "✅ *" + metric.label + "*\n\nNenhum item encontrado.";
    const emoji = id === "overdue_posts" ? "⚠️" : id === "next_5_unplanned" ? "📅" : id === "overdue_tasks" ? "🧩" : id === "today_posts" ? "🗓️" : id === "my_tasks" ? "✅" : "📝";
    return emoji + " *" + metric.label + "*\nTotal: " + rows.length + " item(ns)\n\n" + lines.join("\n");
  });
  return "*Resumo do Maestro*\n📅 " + new Date().toLocaleDateString("pt-BR") + "\n\n" + sections.join("\n\n━━━━━━━━━━━━\n\n");
}

function scheduleLabel(item) {
  const time = item.schedule_time || "09:00";
  const start = item.schedule_date ? " a partir de " + dateLabel(item.schedule_date) : "";
  if (item.frequency === "interval") return "A cada " + (item.interval_days || 1) + " dia(s) às " + time + start;
  if (item.frequency === "weekly") return "Semanal (" + weekdayLabel(item) + ") às " + time + start;
  if (item.frequency === "once") return "Uma vez em " + dateLabel(item.schedule_date) + " às " + time;
  return "Diária às " + time + start;
}

function nextRunLabel(item) {
  if (item.active === false) return "Pausada";
  const time = item.schedule_time || "09:00";
  const today = todayKey();
  if (item.frequency === "once") return item.last_run_at ? "Concluído" : (item.schedule_date ? dateLabel(item.schedule_date) + " às " + time : "Data não definida");
  if (item.schedule_date && item.schedule_date > today) return "A partir de " + dateLabel(item.schedule_date) + " às " + time;
  if (item.frequency === "weekly") return weekdayLabel(item) + " às " + time;
  if (item.frequency === "interval" && item.last_run_at) {
    const next = new Date(item.last_run_at);
    next.setDate(next.getDate() + (Number(item.interval_days) || 1));
    return next.toLocaleDateString("pt-BR", { timeZone: "America/Manaus" }) + " às " + time;
  }
  return "Próximo ciclo às " + time;
}

function Notice({ notice }) {
  if (!notice) return null;
  return <div className={"rounded-lg px-4 py-3 text-sm " + (notice.type === "error" ? "bg-red-50 text-red-700" : notice.type === "success" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700")}>{notice.text}</div>;
}

function GroupSelect({ groups, value, onChange }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground">
    <option value="">Selecione um grupo...</option>
    {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
  </select>;
}

function DominusAutomationPanel({ automation, groups, busy, onSaved, onNotice }) {
  const initialGroups = Array.isArray(automation?.group_ids) && automation.group_ids.length
    ? automation.group_ids
    : automation?.group_id ? [automation.group_id] : [];
  const [selectedGroupIds, setSelectedGroupIds] = useState(initialGroups.map(String));
  const [summaryGroupId, setSummaryGroupId] = useState(String(automation?.summary_group_id || initialGroups[0] || ""));
  const [active, setActive] = useState(automation?.active !== false);
  const [saving, setSaving] = useState(false);
  const [groupQuery, setGroupQuery] = useState("");

  useEffect(() => {
    const next = Array.isArray(automation?.group_ids) && automation.group_ids.length
      ? automation.group_ids
      : automation?.group_id ? [automation.group_id] : [];
    setSelectedGroupIds(next.map(String));
    setSummaryGroupId(String(automation?.summary_group_id || next[0] || ""));
    setActive(automation?.active !== false);
  }, [automation?.id, automation?.active, automation?.group_id, automation?.group_ids, automation?.summary_group_id]);

  const toggleGroup = (groupId) => setSelectedGroupIds((current) => {
    const id = String(groupId);
    if (!current.includes(id)) return [...current, id];
    const next = current.filter((item) => item !== id);
    if (summaryGroupId === id) setSummaryGroupId(next[0] || "");
    return next;
  });
  const normalizedGroupQuery = groupQuery.trim().toLowerCase();
  const visibleGroups = groups.filter((group) => `${group.name || ""} ${group.id || ""}`.toLowerCase().includes(normalizedGroupQuery));
  const selectedGroups = groups.filter((group) => selectedGroupIds.includes(String(group.id)));

  const save = async () => {
    if (!selectedGroupIds.length) {
      onNotice({ type: "info", text: "Selecione pelo menos um grupo para o Dominus." });
      return;
    }
    if (!summaryGroupId || !selectedGroupIds.includes(summaryGroupId)) {
      onNotice({ type: "info", text: "Selecione o grupo que receberá o resumo diário das 20h." });
      return;
    }
    setSaving(true);
    try {
      const result = await invokeMaestroFunction("saveWhatsappAutomation", {
        id: automation?.id,
        kind: "dominus",
        name: "Dominus — respostas em grupos",
        agent_name: "Dominus",
        group_id: selectedGroupIds[0],
        group_ids: selectedGroupIds,
        summary_group_id: summaryGroupId,
        active,
      });
      onSaved(result.data?.automation);
      onNotice({ type: "success", text: active ? "Dominus ativado nos grupos selecionados." : "Dominus pausado." });
    } catch (error) {
      onNotice({ type: "error", text: error.message || "Não foi possível salvar o Dominus." });
    } finally {
      setSaving(false);
    }
  };

  const configureWebhook = async () => {
    setSaving(true);
    try {
      const result = await invokeMaestroFunction("configureWhatsappDominusWebhook", {});
      if (!result.data?.configured) throw new Error(result.data?.error || "Não foi possível ativar o webhook.");
      onNotice({ type: "success", text: "Webhook do Dominus ativado para mensagens recebidas." });
    } catch (error) {
      onNotice({ type: "error", text: error.message || "Não foi possível ativar o webhook do Dominus." });
    } finally {
      setSaving(false);
    }
  };

  return <div className="glass-card space-y-5 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /><h2 className="text-base font-bold text-foreground">Dominus nos grupos da empresa</h2></div>
        <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Quando alguém mencionar “Dominus” em um grupo selecionado, ele responderá com dados do sistema permitidos para o colaborador que enviou a mensagem.</p>
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-4 w-4 accent-primary" /> Ativo</label>
    </div>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>O Dominus ignora mensagens privadas e grupos não selecionados. Usuários inativos não recebem respostas, e Financeiro, Comercial e Configurações continuam protegidos pelas permissões individuais.</span></div></div>
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">Grupos autorizados</p>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" value={groupQuery} onChange={(event) => setGroupQuery(event.target.value)} placeholder="Buscar grupo por nome ou ID..." aria-label="Buscar grupo autorizado" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm font-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {visibleGroups.map((group) => {
          const selected = selectedGroupIds.includes(String(group.id));
          return <button type="button" key={group.id} onClick={() => toggleGroup(group.id)} className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}><span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selected && <span className="text-xs">✓</span>}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{group.name}</span><span className="block truncate font-mono text-[10px] text-muted-foreground">{group.id}</span></span></button>;
        })}
      </div>
      {!visibleGroups.length && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Nenhum grupo encontrado.</p>}
      <p className="mt-2 text-xs text-muted-foreground">{selectedGroupIds.length} grupo(s) selecionado(s). O nome de ativação é sempre Dominus.</p>
    </div>
    <div>
      <label className="block text-xs font-semibold text-muted-foreground">Grupo do resumo diário (20h)<select value={summaryGroupId} onChange={(event) => setSummaryGroupId(event.target.value)} disabled={!selectedGroups.length} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground">
        <option value="">Selecione o grupo do resumo...</option>
        {selectedGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label>
      <p className="mt-2 text-xs text-muted-foreground">O resumo da auditoria será enviado uma vez por dia, às 20h de Manaus, somente para este grupo.</p>
    </div>
    <div className="flex flex-wrap gap-2"><Button type="button" onClick={save} disabled={saving || busy || !selectedGroupIds.length || !summaryGroupId} className="gap-2"><Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar configuração"}</Button><Button type="button" variant="outline" onClick={configureWebhook} disabled={saving || busy} className="gap-2">Ativar recebimento</Button></div>
  </div>;
}

function ScheduleFields({ frequency, onFrequencyChange, scheduleDate, onDateChange, scheduleTime, onTimeChange, weekday, onWeekdayChange, intervalDays, onIntervalChange, allowOnce = true }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <label className="block text-xs font-semibold text-muted-foreground">Frequência<select value={frequency} onChange={(event) => onFrequencyChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground">
      {allowOnce && <option value="once">Uma vez</option>}<option value="daily">Todos os dias</option><option value="weekly">Toda semana</option><option value="interval">A cada intervalo</option>
    </select></label>
    <label className="block text-xs font-semibold text-muted-foreground">{frequency === "once" ? "Dia do envio" : "Início do envio"}<input type="date" value={scheduleDate} onChange={(event) => onDateChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" /></label>
    <label className="block text-xs font-semibold text-muted-foreground">Horário do envio<input type="time" value={scheduleTime} onChange={(event) => onTimeChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" /></label>
    {frequency === "weekly" && <label className="block text-xs font-semibold text-muted-foreground">Dia da semana<select value={weekday} onChange={(event) => onWeekdayChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground">{WEEK_DAYS.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}</select></label>}
    {frequency === "interval" && <label className="block text-xs font-semibold text-muted-foreground">Intervalo em dias<input type="number" min="1" max="365" value={intervalDays} onChange={(event) => onIntervalChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" /></label>}
  </div>;
}

function AutomationBoard({ automations, groups, busy, onToggle, onRemove }) {
  return <div className="glass-card p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-foreground">Agendamentos e recorrências</h3><p className="mt-1 text-xs text-muted-foreground">Acompanhe o destino, a frequência, a próxima execução e o status de cada envio.</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{automations.length} envio(s)</span></div>
    {automations.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum envio agendado.</p> : <div className="space-y-2">{automations.map((automation) => <div key={automation.id} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(180px,auto)_auto] sm:items-center"><div className={"flex h-9 w-9 items-center justify-center rounded-full " + (automation.active === false ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700")} title={automation.active === false ? "Pausado" : "Ativo"}>{automation.active === false ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</div><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{automation.name || (automation.kind === "dashboard" ? "Resumo do dashboard" : "Mensagem recorrente")}</p><p className="truncate text-xs text-muted-foreground">{groups.find((group) => group.id === automation.group_id)?.name || automation.group_id || "Destino não definido"} · {automation.kind === "dashboard" ? "Resumo" : "Mensagem"}</p></div><div className="text-xs text-muted-foreground"><p>{scheduleLabel(automation)}</p><p className={automation.active === false ? "" : "font-semibold text-foreground"}>Próximo: {nextRunLabel(automation)}</p></div><div className="flex items-center gap-2 sm:justify-end"><button type="button" onClick={() => onToggle(automation)} disabled={busy} className="text-xs font-semibold text-primary hover:underline">{automation.active === false ? "Ativar" : "Pausar"}</button><button type="button" onClick={() => onRemove(automation)} disabled={busy} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>}
  </div>;
}

export default function WhatsappReportsPanel({ clients }) {
  const [section, setSection] = useState("summary");
  const [groups, setGroups] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [groupId, setGroupId] = useState("");
  const [metricIds, setMetricIds] = useState(["overdue_posts", "next_5_unplanned"]);
  const [frequency, setFrequency] = useState("once");
  const [scheduleDate, setScheduleDate] = useState(todayKey());
  const [weekday, setWeekday] = useState("1");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [intervalDays, setIntervalDays] = useState(1);
  const [draggedMetricId, setDraggedMetricId] = useState("");
  const [dragOverMetricId, setDragOverMetricId] = useState("");
  const [preview, setPreview] = useState("");
  const [form, setForm] = useState({ name: "", group_id: "", message: "", frequency: "daily", schedule_date: todayKey(), schedule_time: "09:00", interval_days: 1, weekdays: [1, 2, 3, 4, 5] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const selectedGroup = groups.find((group) => group.id === groupId);
  const collaboratorSession = (() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; }
  })();
  const collaboratorId = collaboratorSession?.id || "";
  const canManageDominus = ["master", "gestor"].includes(String(collaboratorSession?.access_level || "").toLowerCase());
  const dominusAutomation = automations.find((item) => item.kind === "dominus");

  const loadData = async () => {
    setLoading(true);
    try {
      const results = await Promise.all([
        invokeMaestroFunction("listWhatsappDirectory", {}),
        invokeMaestroFunction("listWhatsappAutomations", {}),
        maestro.entities.Job.list("-post_date", 5000),
        maestro.entities.Subtask.list("-created_date", 5000),
        maestro.entities.MiniTask.filter({ collaborator_id: collaboratorId }, "-created_date", 1000),
      ]);
      setGroups(results[0].data?.groups || []);
      setAutomations(results[1].data?.automations || []);
      setJobs(results[2] || []);
      setSubtasks(results[3] || []);
      setMyTasks(results[4] || []);
      setNotice(null);
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível carregar os relatórios." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (groupId && !groups.some((group) => group.id === groupId)) setGroupId(""); }, [groups, groupId]);

  const toggleMetric = (id) => setMetricIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.concat(id));
  const moveMetric = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setMetricIds((current) => {
      const next = current.filter((id) => id !== sourceId);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, sourceId);
      return next;
    });
  };
  const generatePreview = () => {
    if (!metricIds.length) return setNotice({ type: "info", text: "Selecione pelo menos uma métrica." });
    setPreview(formatDashboardReport(metricIds, jobs, subtasks, clientNames, myTasks));
    setNotice(null);
  };
  const sendReport = async () => {
    if (!groupId) return setNotice({ type: "info", text: "Selecione um grupo WhatsApp." });
    const text = preview || formatDashboardReport(metricIds, jobs, subtasks, clientNames, myTasks);
    setBusy(true);
    try {
      const result = await invokeMaestroFunction("sendWhatsapp", { phone: groupId, message: text });
      if (!result.data?.success) throw new Error(result.data?.error || "Não foi possível enviar o resumo.");
      setPreview(text);
      setNotice({ type: "success", text: "Resumo enviado para " + (selectedGroup?.name || "o grupo") + "." });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível enviar o resumo." });
    } finally { setBusy(false); }
  };
  const saveReportAutomation = async () => {
    if (!groupId) return setNotice({ type: "info", text: "Selecione um grupo WhatsApp." });
    if (!metricIds.length) return setNotice({ type: "info", text: "Selecione pelo menos uma métrica." });
    setBusy(true);
    try {
      const result = await invokeMaestroFunction("saveWhatsappAutomation", {
        kind: "dashboard", name: "Resumo do dashboard — " + (selectedGroup?.name || "WhatsApp"), group_id: groupId, metrics: metricIds,
        frequency, schedule_date: scheduleDate, schedule_time: scheduleTime, interval_days: Number(intervalDays) || 1, weekdays: frequency === "weekly" ? [Number(weekday)] : [1, 2, 3, 4, 5, 6, 7], active: true, collaborator_id: collaboratorId,
      });
      setAutomations((current) => [result.data?.automation].concat(current.filter((item) => item.id !== result.data?.automation?.id)).filter(Boolean));
      setNotice({ type: "success", text: frequency === "once" ? "Resumo agendado." : "Resumo automático salvo." });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível salvar o resumo." });
    } finally { setBusy(false); }
  };
  const saveTextAutomation = async () => {
    if (!form.group_id) return setNotice({ type: "info", text: "Selecione um grupo WhatsApp." });
    if (!form.message.trim()) return setNotice({ type: "info", text: "Informe a mensagem recorrente." });
    setBusy(true);
    try {
      const result = await invokeMaestroFunction("saveWhatsappAutomation", { ...form, kind: "text", message: form.message.trim(), active: true, interval_days: Number(form.interval_days) || 1 });
      setAutomations((current) => [result.data?.automation].concat(current.filter((item) => item.id !== result.data?.automation?.id)).filter(Boolean));
      setForm((current) => ({ ...current, name: "", message: "" }));
      setNotice({ type: "success", text: form.frequency === "once" ? "Mensagem agendada." : "Mensagem recorrente salva." });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível salvar a automação." });
    } finally { setBusy(false); }
  };
  const toggleAutomation = async (automation) => {
    setBusy(true);
    try {
      const result = await invokeMaestroFunction("saveWhatsappAutomation", { ...automation, active: automation.active === false });
      setAutomations((current) => current.map((item) => item.id === automation.id ? result.data?.automation : item));
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível atualizar a automação." });
    } finally { setBusy(false); }
  };
  const removeAutomation = async (automation) => {
    setBusy(true);
    try {
      await invokeMaestroFunction("deleteWhatsappAutomation", { automationId: automation.id });
      setAutomations((current) => current.filter((item) => item.id !== automation.id));
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível excluir a automação." });
    } finally { setBusy(false); }
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-2">
      <div className="flex flex-wrap gap-1">
        <button type="button" onClick={() => setSection("summary")} className={"flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold " + (section === "summary" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><BarChart3 className="h-4 w-4" /> Resumo do dashboard</button>
        <button type="button" onClick={() => setSection("recurring")} className={"flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold " + (section === "recurring" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><CalendarClock className="h-4 w-4" /> Mensagens recorrentes</button>
        {canManageDominus && <button type="button" onClick={() => setSection("dominus")} className={"flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold " + (section === "dominus" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}><Bot className="h-4 w-4" /> Dominus</button>}
      </div>
      <button type="button" onClick={loadData} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" title="Atualizar dados"><RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /></button>
    </div>
    <Notice notice={notice} />
    {loading ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Carregando dados do dashboard...</div> : groups.length === 0 ? <div className="glass-card p-8 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" /><p className="text-sm font-medium text-foreground">Nenhum grupo WhatsApp salvo</p><p className="mt-1 text-xs text-muted-foreground">Conecte o número e atualize a lista de grupos antes de criar um envio.</p></div> : section === "summary" ? <>
      <div className="glass-card space-y-5 p-5">
        <div><h2 className="text-base font-bold text-foreground">Enviar métricas do dashboard</h2><p className="mt-1 text-xs text-muted-foreground">Escolha o grupo, as informações e a frequência. O texto é organizado automaticamente para leitura no WhatsApp.</p></div>
        <label className="block text-xs font-semibold text-muted-foreground">Grupo WhatsApp<GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></label>
        <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Métricas da mensagem</p><p className="mb-2 text-xs text-muted-foreground">A mensagem seguirá a ordem abaixo, de cima para baixo. Arraste pelo ícone para reorganizar.</p><div className="space-y-2">{metricIds.map((id) => { const metric = REPORT_METRICS.find((item) => item.id === id); if (!metric) return null; return <div key={metric.id} onDragOver={(event) => { event.preventDefault(); setDragOverMetricId(metric.id); }} onDrop={(event) => { event.preventDefault(); moveMetric(draggedMetricId, metric.id); setDraggedMetricId(""); setDragOverMetricId(""); }} className={"flex items-start gap-3 rounded-lg border p-3 " + (dragOverMetricId === metric.id ? "border-primary bg-primary/10" : "border-primary bg-primary/5")}><input id={"dashboard-metric-" + metric.id} type="checkbox" checked onChange={() => toggleMetric(metric.id)} className="mt-0.5 h-4 w-4 accent-primary" /><button type="button" draggable onDragStart={(event) => { setDraggedMetricId(metric.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", metric.id); }} onDragEnd={() => { setDraggedMetricId(""); setDragOverMetricId(""); }} className="mt-0.5 cursor-grab text-muted-foreground hover:text-primary active:cursor-grabbing" aria-label={"Reordenar " + metric.label} title="Arraste para reordenar"><GripVertical className="h-4 w-4" /></button><label htmlFor={"dashboard-metric-" + metric.id} className="min-w-0 flex-1 cursor-pointer"><span className="block text-sm font-medium text-foreground">{metric.label}</span><span className="block text-xs text-muted-foreground">{metric.description}</span></label></div>; })}{REPORT_METRICS.filter((metric) => !metricIds.includes(metric.id)).map((metric) => <label key={metric.id} htmlFor={"dashboard-metric-" + metric.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"><input id={"dashboard-metric-" + metric.id} type="checkbox" checked={false} onChange={() => toggleMetric(metric.id)} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="block text-sm font-medium text-foreground">{metric.label}</span><span className="block text-xs text-muted-foreground">{metric.description}</span></span></label>)}</div></div>
        <ScheduleFields frequency={frequency} onFrequencyChange={setFrequency} scheduleDate={scheduleDate} onDateChange={setScheduleDate} scheduleTime={scheduleTime} onTimeChange={setScheduleTime} weekday={weekday} onWeekdayChange={setWeekday} intervalDays={intervalDays} onIntervalChange={setIntervalDays} />
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={generatePreview} disabled={!metricIds.length} className="gap-2"><BarChart3 className="h-4 w-4" /> Gerar prévia</Button><Button type="button" onClick={sendReport} disabled={busy || !groupId || !metricIds.length} className="gap-2"><Send className="h-4 w-4" /> {busy ? "Enviando..." : "Enviar agora"}</Button><Button type="button" variant="secondary" onClick={saveReportAutomation} disabled={busy || !groupId || !metricIds.length} className="gap-2"><Save className="h-4 w-4" /> {frequency === "once" ? "Agendar resumo" : "Salvar frequência"}</Button></div>
      </div>
      <div className="glass-card p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">Mensagem</h3><span className="text-xs text-muted-foreground">{selectedGroup?.name || "Nenhum grupo"}</span></div><textarea value={preview} onChange={(event) => setPreview(event.target.value)} placeholder="Gere uma prévia para revisar e editar o conteúdo antes do envio." rows={14} className="w-full resize-y rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /><p className="mt-2 text-xs text-muted-foreground">Você pode editar esta mensagem antes de usar “Enviar agora”. Os resumos recorrentes continuam recalculando os dados automaticamente.</p></div>
    </> : section === "dominus" && canManageDominus ? <DominusAutomationPanel automation={dominusAutomation} groups={groups} busy={busy} onSaved={(saved) => setAutomations((current) => [saved].concat(current.filter((item) => item.id !== saved?.id)).filter(Boolean))} onNotice={setNotice} /> : <>
      <div className="glass-card space-y-4 p-5"><div><h2 className="text-base font-bold text-foreground">Nova mensagem recorrente</h2><p className="mt-1 text-xs text-muted-foreground">A mensagem será enviada automaticamente pelo servidor no dia, horário e frequência escolhidos.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-muted-foreground">Nome da automação<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Lembrete de aprovação" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" /></label><label className="block text-xs font-semibold text-muted-foreground">Grupo WhatsApp<GroupSelect groups={groups} value={form.group_id} onChange={(value) => setForm({ ...form, group_id: value })} /></label></div><label className="block text-xs font-semibold text-muted-foreground">Mensagem<textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={4} placeholder="Escreva a mensagem..." className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" /></label><ScheduleFields frequency={form.frequency} onFrequencyChange={(value) => setForm({ ...form, frequency: value })} scheduleDate={form.schedule_date} onDateChange={(value) => setForm({ ...form, schedule_date: value })} scheduleTime={form.schedule_time} onTimeChange={(value) => setForm({ ...form, schedule_time: value })} weekday={String(form.weekdays[0] || 1)} onWeekdayChange={(value) => setForm({ ...form, weekdays: [Number(value)] })} intervalDays={form.interval_days} onIntervalChange={(value) => setForm({ ...form, interval_days: value })} /><Button type="button" onClick={saveTextAutomation} disabled={busy} className="gap-2"><Save className="h-4 w-4" /> {form.frequency === "once" ? "Agendar mensagem" : "Salvar mensagem recorrente"}</Button></div>
    </>}
    {!loading && groups.length > 0 && <AutomationBoard automations={automations.filter((item) => item.kind !== "dominus")} groups={groups} busy={busy} onToggle={toggleAutomation} onRemove={removeAutomation} />}
  </div>;
}
