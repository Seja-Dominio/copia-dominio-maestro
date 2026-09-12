import { useEffect, useState } from "react";
import { maestro, invokeMaestroFunction } from "@/api/maestroClient";
import { Button } from "@/components/ui/button";
import { BarChart3, CalendarClock, Pause, Play, RefreshCw, Save, Send, Trash2, Users } from "lucide-react";

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
    const lines = rows.map((row) => {
      const job = id === "overdue_tasks" ? jobs.find((item) => item.id === row.job_id) : row;
      const client = clientNames.get(job?.client_id) || job?.client_name || "Cliente não identificado";
      if (id === "my_tasks") return "• " + (row.title || "Tarefa sem título") + " · " + dateLabel(row.due_date);
      const title = id === "overdue_tasks" ? (job?.title || "Job") + " — " + (row.title || "Tarefa") : (row.title || "Post sem título");
      const missing = id === "missing_content" ? " · faltando: " + [!String(row.briefing || "").trim() ? "briefing" : "", !String(row.caption || "").trim() ? "legenda" : ""].filter(Boolean).join(" e ") : "";
      return "• " + client + " · " + title + " · " + dateLabel(row.deadline || row.post_date) + missing;
    });
    if (!rows.length) return "✅ *" + metric.label + "*\n\nNenhum item encontrado.";
    const emoji = id === "overdue_posts" ? "⚠️" : id === "next_5_unplanned" ? "📅" : id === "overdue_tasks" ? "🧩" : id === "today_posts" ? "🗓️" : id === "my_tasks" ? "✅" : "📝";
    return emoji + " *" + metric.label + "*\nTotal: " + rows.length + " item(ns)\n\n" + lines.join("\n");
  });
  return "*Resumo do Maestro*\n📅 " + new Date().toLocaleDateString("pt-BR") + "\n\n" + sections.join("\n\n━━━━━━━━━━━━\n\n");
}

function scheduleLabel(item) {
  if (item.frequency === "interval") return "A cada " + (item.interval_days || 1) + " dia(s) às " + (item.schedule_time || "09:00");
  if (item.frequency === "weekly") return "Semanal às " + (item.schedule_time || "09:00");
  if (item.frequency === "once") return "Somente agora";
  return "Diária às " + (item.schedule_time || "09:00");
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
  const [weekday, setWeekday] = useState("1");
  const [preview, setPreview] = useState("");
  const [form, setForm] = useState({ name: "", group_id: "", message: "", frequency: "daily", schedule_time: "09:00", interval_days: 1, weekdays: [1, 2, 3, 4, 5] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const selectedGroup = groups.find((group) => group.id === groupId);
  const collaboratorId = (() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null")?.id || ""; } catch { return ""; }
  })();

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
        frequency, schedule_time: "09:00", weekdays: frequency === "weekly" ? [Number(weekday)] : [1, 2, 3, 4, 5, 6, 7], active: frequency !== "once", collaborator_id: collaboratorId,
      });
      setAutomations((current) => [result.data?.automation].concat(current.filter((item) => item.id !== result.data?.automation?.id)).filter(Boolean));
      setNotice({ type: "success", text: frequency === "once" ? "Resumo salvo. Use Enviar agora para dispará-lo." : "Resumo automático salvo." });
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
      setNotice({ type: "success", text: "Mensagem recorrente salva." });
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
      </div>
      <button type="button" onClick={loadData} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" title="Atualizar dados"><RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /></button>
    </div>
    <Notice notice={notice} />
    {loading ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Carregando dados do dashboard...</div> : groups.length === 0 ? <div className="glass-card p-8 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" /><p className="text-sm font-medium text-foreground">Nenhum grupo WhatsApp salvo</p><p className="mt-1 text-xs text-muted-foreground">Conecte o número e atualize a lista de grupos antes de criar um envio.</p></div> : section === "summary" ? <>
      <div className="glass-card space-y-5 p-5">
        <div><h2 className="text-base font-bold text-foreground">Enviar métricas do dashboard</h2><p className="mt-1 text-xs text-muted-foreground">Escolha o grupo, as informações e a frequência. O texto é organizado automaticamente para leitura no WhatsApp.</p></div>
        <label className="block text-xs font-semibold text-muted-foreground">Grupo WhatsApp<GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></label>
        <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Métricas da mensagem</p><div className="space-y-2">{REPORT_METRICS.map((metric) => <label key={metric.id} className={"flex cursor-pointer items-start gap-3 rounded-lg border p-3 " + (metricIds.includes(metric.id) ? "border-primary bg-primary/5" : "border-border")}><input type="checkbox" checked={metricIds.includes(metric.id)} onChange={() => toggleMetric(metric.id)} className="mt-0.5 h-4 w-4 accent-primary" /><span><span className="block text-sm font-medium text-foreground">{metric.label}</span><span className="block text-xs text-muted-foreground">{metric.description}</span></span></label>)}</div></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-muted-foreground">Frequência<select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground"><option value="once">Somente agora</option><option value="daily">Todos os dias</option><option value="weekly">Toda semana</option></select></label>{frequency === "weekly" && <label className="block text-xs font-semibold text-muted-foreground">Dia da semana<select value={weekday} onChange={(event) => setWeekday(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground"><option value="1">Segunda-feira</option><option value="2">Terça-feira</option><option value="3">Quarta-feira</option><option value="4">Quinta-feira</option><option value="5">Sexta-feira</option><option value="6">Sábado</option><option value="7">Domingo</option></select></label>}</div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={generatePreview} disabled={!metricIds.length} className="gap-2"><BarChart3 className="h-4 w-4" /> Gerar prévia</Button><Button type="button" onClick={sendReport} disabled={busy || !groupId || !metricIds.length} className="gap-2"><Send className="h-4 w-4" /> {busy ? "Enviando..." : "Enviar agora"}</Button><Button type="button" variant="secondary" onClick={saveReportAutomation} disabled={busy || !groupId || !metricIds.length} className="gap-2"><Save className="h-4 w-4" /> Salvar frequência</Button></div>
      </div>
      <div className="glass-card p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">Prévia da mensagem</h3><span className="text-xs text-muted-foreground">{selectedGroup?.name || "Nenhum grupo"}</span></div><pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm leading-6 text-foreground">{preview || "Gere uma prévia para revisar o conteúdo antes do envio."}</pre></div>
    </> : <>
      <div className="glass-card space-y-4 p-5"><div><h2 className="text-base font-bold text-foreground">Nova mensagem recorrente</h2><p className="mt-1 text-xs text-muted-foreground">A mensagem será enviada automaticamente pelo servidor nos dias e horários escolhidos.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-muted-foreground">Nome da automação<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Lembrete de aprovação" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" /></label><label className="block text-xs font-semibold text-muted-foreground">Grupo WhatsApp<GroupSelect groups={groups} value={form.group_id} onChange={(value) => setForm({ ...form, group_id: value })} /></label></div><label className="block text-xs font-semibold text-muted-foreground">Mensagem<textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={4} placeholder="Escreva a mensagem..." className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" /></label><div className="grid gap-3 sm:grid-cols-3"><label className="block text-xs font-semibold text-muted-foreground">Frequência<select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground"><option value="daily">Todos os dias</option><option value="weekly">Toda semana</option><option value="interval">A cada intervalo</option></select></label><label className="block text-xs font-semibold text-muted-foreground">Horário<input type="time" value={form.schedule_time} onChange={(event) => setForm({ ...form, schedule_time: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" /></label>{form.frequency === "interval" && <label className="block text-xs font-semibold text-muted-foreground">Intervalo em dias<input type="number" min="1" max="365" value={form.interval_days} onChange={(event) => setForm({ ...form, interval_days: event.target.value })} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" /></label>}</div>{form.frequency !== "interval" && <div><p className="mb-2 text-xs font-semibold text-muted-foreground">Dias de envio</p><div className="flex flex-wrap gap-2">{WEEK_DAYS.map((day) => <button type="button" key={day.id} onClick={() => setForm({ ...form, weekdays: form.weekdays.includes(day.id) ? form.weekdays.filter((item) => item !== day.id) : form.weekdays.concat(day.id) })} className={"rounded-lg border px-3 py-1.5 text-xs font-semibold " + (form.weekdays.includes(day.id) ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted")}>{day.label}</button>)}</div></div>}<Button type="button" onClick={saveTextAutomation} disabled={busy} className="gap-2"><Save className="h-4 w-4" /> Salvar mensagem recorrente</Button></div>
      <div className="glass-card p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-foreground">Automações salvas</h3><span className="text-xs text-muted-foreground">{automations.length}</span></div>{automations.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma automação configurada.</p> : <div className="space-y-2">{automations.map((automation) => <div key={automation.id} className="flex items-center gap-3 rounded-lg border border-border p-3"><div className={"flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full " + (automation.active === false ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700")}>{automation.active === false ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{automation.name || "Automação sem nome"}</p><p className="truncate text-xs text-muted-foreground">{groups.find((group) => group.id === automation.group_id)?.name || automation.group_id} · {scheduleLabel(automation)}</p></div><button type="button" onClick={() => toggleAutomation(automation)} disabled={busy} className="text-xs font-semibold text-primary hover:underline">{automation.active === false ? "Ativar" : "Pausar"}</button><button type="button" onClick={() => removeAutomation(automation)} disabled={busy} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></div>)}</div>}</div>
    </>}
  </div>;
}
