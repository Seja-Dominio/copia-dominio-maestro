import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Session = { sub: string; exp: number; access_level?: string; permissions?: Record<string, unknown> };
type WhatsappPayload = {
  action?: "send" | "listGroups" | "listContacts" | "syncDirectory" | "listDirectory" | "linkClient" | "connect" | "status" | "listAutomations" | "saveAutomation" | "deleteAutomation" | "configureDominusWebhook" | "processScheduled";
  phone?: string;
  message?: string;
  fileUrl?: string;
  caption?: string;
  fileName?: string;
  fileType?: string;
  clientId?: string;
  groupId?: string | null;
  groupIds?: string[];
  contactIds?: string[];
  automation?: Record<string, unknown>;
  automationId?: string;
};
type EvolutionConfig = { baseUrl: string; apiKey: string; instance: string };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function verifySession(token: string): Promise<Session | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(decode(signature), (character) => character.charCodeAt(0)),
    new TextEncoder().encode(body),
  );
  if (!valid) return null;
  const session = JSON.parse(decode(body)) as Session;
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
  const { data } = await supabase.from("maestro_collaborators").select("id, is_active, profile").eq("id", session.sub).maybeSingle();
  if (!data?.is_active) return null;
  const profile = (data.profile || {}) as Record<string, unknown>;
  const rawLevel = String(profile.access_level || session.access_level || "collaborator").toLowerCase();
  return { ...session, access_level: rawLevel === "admin" ? "master" : rawLevel, permissions: (profile.permissions || {}) as Record<string, unknown> };
}

function canManageDominus(session: Session) {
  return ["master", "gestor"].includes(String(session.access_level || "").toLowerCase());
}

function validGroupIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(String).filter((id) => id.endsWith("@g.us")))]
    : [];
}

function cors(origin = "") {
  const allowed = new Set([
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "https://dominiomaestro.com.br",
    "https://www.dominiomaestro.com.br",
  ]);
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://dominiomaestro.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function evolutionConfig() {
  const baseUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const apiKey = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_INSTANCE");
  return baseUrl && apiKey && instance ? { baseUrl, apiKey, instance } : null;
}

async function evolutionRequest(config: { baseUrl: string; apiKey: string; instance: string }, path: string, init: RequestInit = {}) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      apikey: config.apiKey,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { response, data };
}

function normalizeGroups(payload: any) {
  const groups = Array.isArray(payload)
    ? payload
    : (payload?.groups || payload?.data || payload?.value || []);

  return (Array.isArray(groups) ? groups : [])
    .map((group: any) => {
      const id = group?.id || group?.jid || group?.remoteJid || group?.phone || "";
      return {
        id: String(id),
        name: group?.subject || group?.name || group?.title || String(id),
      };
    })
    .filter((group: { id: string }) => group.id.endsWith("@g.us"));
}

function normalizeContacts(payload: any) {
  const contacts = Array.isArray(payload)
    ? payload
    : (payload?.contacts || payload?.data || payload?.value || []);

  return (Array.isArray(contacts) ? contacts : [])
    .map((contact: any) => {
      const id = contact?.id || contact?.remoteJid || contact?.jid || contact?.phone || "";
      const phone = contact?.phone || contact?.number || String(id).split("@")[0];
      return {
        id: String(id),
        name: contact?.pushName || contact?.name || contact?.notify || contact?.verifiedName || phone,
        phone: String(phone || ""),
      };
    })
    .filter((contact: { id: string }) => contact.id && !contact.id.endsWith("@g.us"));
}

function extractQrCode(payload: any) {
  const candidate = payload?.qrcode?.base64 || payload?.qrcode?.code || payload?.base64 || payload?.code || payload?.data?.base64 || payload?.data?.code;
  if (!candidate || typeof candidate !== "string") return null;
  return candidate.startsWith("data:image/") ? candidate : `data:image/png;base64,${candidate}`;
}

async function fetchDirectory(config: { baseUrl: string; apiKey: string; instance: string }) {
  const [groupsResult, contactsResult] = await Promise.all([
    evolutionRequest(config, `/group/fetchAllGroups/${encodeURIComponent(config.instance)}?getParticipants=false`),
    evolutionRequest(config, `/chat/findContacts/${encodeURIComponent(config.instance)}`, { method: "POST", body: JSON.stringify({}) }),
  ]);
  if (!groupsResult.response.ok) throw new Error(groupsResult.data?.message || "Erro ao buscar grupos no WhatsApp");
  if (!contactsResult.response.ok) throw new Error(contactsResult.data?.message || "Erro ao buscar contatos no WhatsApp");
  return { groups: normalizeGroups(groupsResult.data), contacts: normalizeContacts(contactsResult.data) };
}

async function saveDirectory(directory: { groups: Array<{ id: string; name: string }>; contacts: Array<{ id: string; name: string; phone: string }> }, instance: string) {
  const now = new Date().toISOString();
  const rows = [
    ...directory.groups.map((group) => ({ entity: "WhatsappGroup", record_id: `${instance}:${group.id}`, payload: { ...group, instance, updated_at: now }, source_created_at: now, source_updated_at: now })),
    ...directory.contacts.map((contact) => ({ entity: "WhatsappContact", record_id: `${instance}:${contact.id}`, payload: { ...contact, instance, updated_at: now }, source_created_at: now, source_updated_at: now })),
  ];
  if (!rows.length) return;
  const { error } = await supabase.from("legacy_records").upsert(rows, { onConflict: "entity,record_id" });
  if (error) throw error;
}

async function listSavedDirectory(instance: string) {
  const [{ data: groups, error: groupsError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("legacy_records").select("payload").eq("entity", "WhatsappGroup").order("source_updated_at", { ascending: false }),
    supabase.from("legacy_records").select("payload").eq("entity", "WhatsappContact").order("source_updated_at", { ascending: false }),
  ]);
  if (groupsError || contactsError) throw groupsError || contactsError;
  // The directory is shared across numbers. Never remove old records when a
  // number disconnects; keep the newest name for duplicated JIDs instead.
  const uniqueById = (rows: any[]) => {
    const seen = new Set<string>();
    return rows.map((row) => row.payload).filter((item) => {
      const id = String(item?.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  };
  return { groups: uniqueById(groups || []), contacts: uniqueById(contacts || []) };
}

async function listAutomations() {
  const { data, error } = await supabase.from("legacy_records").select("record_id,payload,source_updated_at").eq("entity", "WhatsappAutomation").order("source_updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({ id: row.record_id, ...(row.payload || {}) }));
}

async function saveAutomation(automation: Record<string, unknown>) {
  const id = String(automation.id || crypto.randomUUID());
  const now = new Date().toISOString();
  const payload = { ...automation, id, updated_at: now, created_at: automation.created_at || now };
  const { error } = await supabase.from("legacy_records").upsert({
    entity: "WhatsappAutomation",
    record_id: id,
    payload,
    source_created_at: automation.created_at || now,
    source_updated_at: now,
  }, { onConflict: "entity,record_id" });
  if (error) throw error;
  return payload;
}

async function deleteAutomation(id: string) {
  const { error } = await supabase.from("legacy_records").delete().eq("entity", "WhatsappAutomation").eq("record_id", id);
  if (error) throw error;
  return { deleted: true, id };
}

function manausNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const date = String(values.year) + "-" + String(values.month) + "-" + String(values.day);
  return { date, time: String(values.hour) + ":" + String(values.minute), weekday: new Date(date + "T12:00:00").getDay() || 7 };
}

function automationIsDue(automation: any, now: { date: string; time: string; weekday: number }) {
  if (automation.active === false) return false;
  const scheduleDate = String(automation.schedule_date || "");
  if (scheduleDate && now.date < scheduleDate) return false;
  if (String(automation.schedule_time || "09:00") > now.time) return false;
  if (automation.frequency === "once") {
    return Boolean(scheduleDate && scheduleDate === now.date && !automation.last_run_at);
  }
  if (automation.last_run_local_date === now.date) return false;
  if (automation.frequency === "weekly" && Array.isArray(automation.weekdays) && !automation.weekdays.map(Number).includes(now.weekday)) return false;
  if (automation.frequency === "daily" && Array.isArray(automation.weekdays) && automation.weekdays.length && !automation.weekdays.map(Number).includes(now.weekday)) return false;
  if (automation.frequency === "interval" && automation.last_run_at) {
    const elapsed = Date.now() - new Date(automation.last_run_at).getTime();
    if (elapsed < (Number(automation.interval_days) || 1) * 86400000) return false;
  }
  return true;
}

async function loadEntityPayloads(entity: string) {
  const { data, error } = await supabase.from("legacy_records").select("record_id,payload").eq("entity", entity).limit(10000);
  if (error) throw error;
  return (data || []).map((row: any) => ({ id: row.record_id, ...(row.payload || {}) }));
}

function scheduledDashboardText(automation: any, jobs: any[], subtasks: any[], clients: any[], miniTasks: any[] = []) {
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const selected = Array.isArray(automation.metrics) && automation.metrics.length ? automation.metrics : ["overdue_posts", "next_5_unplanned"];
  const today = manausNow().date;
  const next = new Date(today + "T12:00:00");
  next.setDate(next.getDate() + 5);
  const nextKey = next.toISOString().slice(0, 10);
  const excluded = ["completed", "scheduled", "cancelled"];
  const rowsFor = (id: string) => {
    if (id === "overdue_posts") return jobs.filter((job) => job.post_date && job.post_date <= today && !excluded.includes(job.status));
    if (id === "next_5_unplanned") return jobs.filter((job) => job.post_date && job.post_date > today && job.post_date <= nextKey && !excluded.includes(job.status));
    if (id === "today_posts") return jobs.filter((job) => job.post_date === today && job.status !== "cancelled");
    if (id === "my_tasks") return miniTasks.filter((task) => (!automation.collaborator_id || task.collaborator_id === automation.collaborator_id) && !task.is_completed && task.status !== "completed");
    if (id === "missing_content") return jobs.filter((job) => !excluded.includes(job.status) && (!String(job.briefing || "").trim() || !String(job.caption || "").trim()));
    const byId = new Map(jobs.map((job) => [job.id, job]));
    return subtasks.filter((task) => {
      const job = byId.get(task.job_id);
      const deadline = task.deadline || job?.post_date;
      return deadline && deadline <= today && !task.is_completed && task.status !== "completed" && job && !excluded.includes(job.status);
    });
  };
  const labels: Record<string, [string, string]> = { overdue_posts: ["⚠️", "Posts atrasados"], next_5_unplanned: ["📅", "Próximos 5 dias sem agendamento"], overdue_tasks: ["🧩", "Tarefas atrasadas"], today_posts: ["🗓️", "Postagens de hoje"], my_tasks: ["✅", "Minhas tarefas"], missing_content: ["📝", "Jobs com briefing e/ou legenda vazio"] };
  const sections = selected.map((id: string) => {
    const rows = rowsFor(id);
    const label = labels[id] || ["📌", id];
    if (!rows.length) return "✅ *" + label[1] + "*\n\nNenhum item encontrado.";
    const lines = rows.map((row: any) => {
      const job = id === "overdue_tasks" || id === "my_tasks" ? jobsById.get(row.job_id) : row;
      const client = clientNames.get(job?.client_id) || job?.client_name || "Cliente não identificado";
      const title = job?.title || (id === "my_tasks" ? "Sem job vinculado" : "Job sem título");
      const stage = id === "overdue_tasks" ? row.title || "Etapa não identificada" : row.stage_title || job?.stage_title || (id === "my_tasks" ? "Minha tarefa" : "Etapa não identificada");
      const responsible = id === "overdue_tasks" ? row.responsible_name || job?.stage_responsible_name || job?.responsible_name || "Sem responsável" : row.responsible_name || row.collaborator_name || row.stage_responsible_name || job?.stage_responsible_name || job?.responsible_name || "Sem responsável";
      const date = row.deadline || row.due_date || row.post_date || job?.post_date;
      const missing = id === "missing_content" ? " · faltando: " + [!String(row.briefing || "").trim() ? "briefing" : "", !String(row.caption || "").trim() ? "legenda" : ""].filter(Boolean).join(" e ") : "";
      return "• " + (date ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR") : "sem data") + " · " + client + " · " + title + " · " + stage + " · " + responsible + missing;
    });
    return label[0] + " *" + label[1] + "*\nTotal: " + rows.length + " item(ns)\n\n" + lines.join("\n");
  });
  return "*Resumo do Maestro*\n📅 " + new Date().toLocaleDateString("pt-BR") + "\n\n" + sections.join("\n\n━━━━━━━━━━━━\n\n");
}

function formatDateBR(value: string) {
  return value ? value.split("-").reverse().join("/") : "sem data";
}

function isOverdueSubtask(task: any, job: any, today: string) {
  const status = String(task.status || "pending").trim().toLowerCase();
  const deadline = task.deadline || job?.post_date;
  return Boolean(
    task.responsible_id &&
    deadline &&
    deadline <= today &&
    task.is_completed !== true &&
    status !== "completed" &&
    job &&
    !["completed", "scheduled", "cancelled"].includes(String(job.status || "")),
  );
}

function dailyOverdueText(collaborator: any, tasks: any[], jobs: any[], clients: any[], today: string) {
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const clientNames = new Map(clients.map((client) => [client.id, client.name]));
  const grouped = new Map<string, { job: any; client: string; tasks: any[] }>();
  for (const task of tasks) {
    const job = jobsById.get(task.job_id);
    if (!isOverdueSubtask(task, job, today)) continue;
    const key = String(job.id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        job,
        client: clientNames.get(job.client_id) || job.client_name || "Cliente não identificado",
        tasks: [],
      });
    }
    grouped.get(key)!.tasks.push(task);
  }
  if (!grouped.size) return null;

  const rows = [...grouped.values()].sort((left, right) => `${left.client}${left.job.title}`.localeCompare(`${right.client}${right.job.title}`));
  const total = rows.reduce((sum, row) => sum + row.tasks.length, 0);
  const sections = rows.map((row) => {
    const lines = row.tasks
      .sort((left, right) => String(left.deadline || "9999").localeCompare(String(right.deadline || "9999")))
      .map((task) => `• ${task.title || "Tarefa sem título"}\n  Prazo: ${formatDateBR(task.deadline || row.job.post_date)}`);
    return `*${row.client} — ${row.job.title || "Job sem título"}*\n${lines.join("\n")}`;
  });
  return `*Resumo diário de tarefas atrasadas*\n📅 ${formatDateBR(today)}\n👤 Responsável: ${collaborator.name || collaborator.full_name || "Colaborador"}\nTotal: ${total} tarefa${total === 1 ? "" : "s"}\n\n${sections.join("\n\n━━━━━━━━━━━━\n\n")}`;
}

async function sendDailyOverdueNotifications(config: EvolutionConfig | null, now: { date: string; time: string }, collaborators: any[], jobs: any[], subtasks: any[], clients: any[], projects: any[]) {
  // The scheduler runs every five minutes; this window makes the daily dispatch happen once around 07:00 Manaus (GMT-4).
  if (now.time < "07:00" || now.time > "07:10") return [];
  const inactiveProjectIds = new Set(projects.filter((project) => ["completed", "archived"].includes(String(project.status || ""))).map((project) => project.id));
  const activeJobs = jobs.filter((job) => !["completed", "scheduled", "cancelled"].includes(String(job.status || "")) && (!job.project_id || !inactiveProjectIds.has(job.project_id)));
  const results = [];

  for (const collaborator of collaborators.filter((item) => item.is_active !== false)) {
    const assigned = subtasks.filter((task) => task.responsible_id === collaborator.id);
    const message = dailyOverdueText(collaborator, assigned, activeJobs, clients, now.date);
    if (!message) continue;
    const notificationId = `daily-overdue:${collaborator.id}:${now.date}`;
    const { data: existing, error: existingError } = await supabase
      .from("legacy_records")
      .select("record_id")
      .eq("entity", "Notification")
      .eq("record_id", notificationId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const createdAt = new Date().toISOString();
    const notification = {
      id: notificationId,
      user_id: collaborator.id,
      type: "daily_summary",
      title: "Resumo diário de tarefas atrasadas",
      message,
      entity_type: "daily_overdue",
      entity_id: now.date,
      is_read: false,
      created_date: createdAt,
    };
    const { error: notificationError } = await supabase.from("legacy_records").upsert({
      entity: "Notification",
      record_id: notificationId,
      payload: notification,
      source_created_at: createdAt,
      source_updated_at: createdAt,
    }, { onConflict: "entity,record_id" });
    if (notificationError) throw notificationError;

    const phone = collaborator.whatsapp_phone || collaborator.phone || collaborator.phone_number || collaborator.whatsapp;
    let whatsappSent = false;
    if (config && phone) {
      const result = await evolutionRequest(config, "/message/sendText/" + encodeURIComponent(config.instance), { method: "POST", body: JSON.stringify({ number: phone, text: message }) });
      whatsappSent = result.response.ok;
    }
    results.push({ collaboratorId: collaborator.id, notificationId, whatsappSent });
  }
  return results;
}

async function processScheduled(config: EvolutionConfig | null) {
  const [automations, jobs, subtasks, clients, collaborators, projects, miniTasks] = await Promise.all([
    loadEntityPayloads("WhatsappAutomation"),
    loadEntityPayloads("Job"),
    loadEntityPayloads("Subtask"),
    loadEntityPayloads("Client"),
    loadEntityPayloads("Collaborator"),
    loadEntityPayloads("Project"),
    loadEntityPayloads("MiniTask"),
  ]);
  const now = manausNow();
  const dailyNotifications = await sendDailyOverdueNotifications(config, now, collaborators, jobs, subtasks, clients, projects);
  const results = [];
  for (const automation of automations.filter((item) => item.kind !== "dominus" && automationIsDue(item, now))) {
    if (!config) continue;
    const message = automation.kind === "dashboard" ? scheduledDashboardText(automation, jobs, subtasks, clients, miniTasks) : String(automation.message || "").trim();
    if (!message || !automation.group_id) continue;
    const result = await evolutionRequest(config, "/message/sendText/" + encodeURIComponent(config.instance), { method: "POST", body: JSON.stringify({ number: automation.group_id, text: message }) });
    if (!result.response.ok) throw new Error(result.data?.message || "Erro ao executar automação do WhatsApp");
    const updated = await saveAutomation({
      ...automation,
      active: automation.frequency === "once" ? false : automation.active !== false,
      last_run_at: new Date().toISOString(),
      last_run_local_date: now.date,
    });
    results.push({ id: automation.id, name: automation.name, sent: true, updated });
  }
  return { processed: results.length, results, dailyNotifications, checkedAt: new Date().toISOString() };
}

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  let action = "send";
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const payload = await request.json() as WhatsappPayload;
    action = payload.action || "send";
    const config = evolutionConfig();

    if (payload.action === "processScheduled") {
      const { data: cronSecret } = await supabase.rpc("get_whatsapp_automation_cron_secret");
      if (!cronSecret || request.headers.get("x-maestro-cron-secret") !== cronSecret) return json({ error: "Acesso interno não autorizado" }, 401, origin);
      return json(await processScheduled(config), 200, origin);
    }

    if (!config) return json({ error: "Evolution API não configurada no servidor" }, 503, origin);

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = token ? await verifySession(token) : null;
    if (!session) return json({ error: "Sessão inválida ou expirada" }, 401, origin);

    if (payload.action === "listGroups") {
      const { response, data } = await evolutionRequest(config, `/group/fetchAllGroups/${encodeURIComponent(config.instance)}?getParticipants=false`);
      if (!response.ok) return json({ error: data?.message || "Erro ao buscar grupos no WhatsApp" }, response.status, origin);
      return json({ groups: normalizeGroups(data) }, 200, origin);
    }

    if (payload.action === "listContacts") {
      const { response, data } = await evolutionRequest(config, `/chat/findContacts/${encodeURIComponent(config.instance)}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok) return json({ error: data?.message || "Erro ao buscar contatos no WhatsApp" }, response.status, origin);
      return json({ contacts: normalizeContacts(data) }, 200, origin);
    }

    if (payload.action === "syncDirectory") {
      const directory = await fetchDirectory(config);
      await saveDirectory(directory, config.instance);
      return json({ ...directory, saved: true, syncedAt: new Date().toISOString() }, 200, origin);
    }

    if (payload.action === "listDirectory") {
      return json(await listSavedDirectory(config.instance), 200, origin);
    }

    if (payload.action === "linkClient") {
      const clientId = String(payload.clientId || "");
      if (!clientId) return json({ error: "clientId é obrigatório" }, 400, origin);
      const { data: current, error: currentError } = await supabase
        .from("legacy_records")
        .select("payload")
        .eq("entity", "Client")
        .eq("record_id", clientId)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current?.payload) return json({ error: "Cliente não encontrado" }, 404, origin);
      const contactIds = Array.isArray(payload.contactIds) ? payload.contactIds.map(String).filter(Boolean) : [];
      const groupIds = Array.isArray(payload.groupIds)
        ? payload.groupIds.map(String).filter(Boolean)
        : (payload.groupId ? [String(payload.groupId)] : []);
      const nextPayload = {
        ...current.payload,
        whatsapp_group_id: groupIds[0] || "",
        whatsapp_group_ids: groupIds,
        whatsapp_contact_ids: contactIds,
      };
      const now = new Date().toISOString();
      const { error } = await supabase.from("legacy_records").upsert({
        entity: "Client",
        record_id: clientId,
        payload: nextPayload,
        source_updated_at: now,
      }, { onConflict: "entity,record_id" });
      if (error) throw error;
      return json({ client: nextPayload }, 200, origin);
    }

    if (payload.action === "listAutomations") {
      return json({ automations: await listAutomations() }, 200, origin);
    }

    if (payload.action === "configureDominusWebhook") {
      if (!canManageDominus(session)) return json({ error: "A configuração do Dominus exige perfil Gestor ou Master." }, 403, origin);
      const webhookSecret = Deno.env.get("DOMINUS_WEBHOOK_SECRET") || "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      if (!webhookSecret || !supabaseUrl) return json({ error: "O segredo do webhook do Dominus ainda não foi configurado." }, 503, origin);
      const webhookUrl = `${supabaseUrl}/functions/v1/dominus-webhook?token=${encodeURIComponent(webhookSecret)}`;
      const { response, data } = await evolutionRequest(config, `/webhook/set/${encodeURIComponent(config.instance)}`, {
        method: "POST",
        body: JSON.stringify({ enabled: true, url: webhookUrl, webhook_by_events: false, webhook_base64: false, events: ["MESSAGES_UPSERT"] }),
      });
      if (!response.ok) return json({ error: data?.message || "Não foi possível configurar o webhook do Dominus." }, response.status, origin);
      return json({ configured: true, event: "MESSAGES_UPSERT" }, 200, origin);
    }

    if (payload.action === "saveAutomation") {
      if (!payload.automation || typeof payload.automation !== "object") return json({ error: "automation é obrigatório" }, 400, origin);
      const automation = payload.automation as Record<string, unknown>;
      if (automation.kind === "dominus") {
        if (!canManageDominus(session)) return json({ error: "A configuração do Dominus exige perfil Gestor ou Master." }, 403, origin);
        const groupIds = validGroupIds(automation.group_ids || (automation.group_id ? [automation.group_id] : []));
        if (!groupIds.length) return json({ error: "Selecione pelo menos um grupo WhatsApp para o Dominus." }, 400, origin);
        automation.group_ids = groupIds;
        automation.group_id = groupIds[0];
        automation.agent_name = "Dominus";
      } else if (!String(automation.group_id || "")) return json({ error: "Selecione um grupo WhatsApp" }, 400, origin);
      if (automation.kind === "text" && !String(automation.message || "").trim()) return json({ error: "Informe a mensagem" }, 400, origin);
      return json({ automation: await saveAutomation(automation) }, 200, origin);
    }

    if (payload.action === "deleteAutomation") {
      const id = String(payload.automationId || "");
      if (!id) return json({ error: "automationId é obrigatório" }, 400, origin);
      const automations = await listAutomations();
      const target = automations.find((item) => item.id === id);
      if (target?.kind === "dominus" && !canManageDominus(session)) return json({ error: "A configuração do Dominus exige perfil Gestor ou Master." }, 403, origin);
      return json(await deleteAutomation(id), 200, origin);
    }

    if (payload.action === "connect") {
      const stateResult = await evolutionRequest(config, `/instance/connectionState/${encodeURIComponent(config.instance)}`);
      const currentState = stateResult.data?.state || stateResult.data?.instance?.state || stateResult.data?.data?.state || "unknown";
      if (stateResult.response.ok && currentState === "open") {
        return json({ connected: true, state: currentState }, 200, origin);
      }

      // Evolution API v2 returns the current QR as base64 from this endpoint.
      const { response, data } = await evolutionRequest(config, `/instance/connect/${encodeURIComponent(config.instance)}`);
      const qrCode = extractQrCode(data);
      if (!response.ok && !qrCode) {
        return json({ connected: false, state: currentState, error: data?.message || "Não foi possível iniciar a conexão do WhatsApp" }, response.status, origin);
      }
      return json({ connected: false, state: currentState, qrCode, code: data?.qrcode?.code || data?.code || null }, 200, origin);
    }

    if (payload.action === "status") {
      const { response, data } = await evolutionRequest(config, `/instance/connectionState/${encodeURIComponent(config.instance)}`);
      if (!response.ok) return json({ connected: false, state: "error", error: data?.message || "Não foi possível consultar a conexão" }, response.status, origin);
      const state = data?.state || data?.instance?.state || data?.data?.state || "unknown";
      return json({ connected: state === "open", state, data }, 200, origin);
    }

    const { phone, message, fileUrl, caption, fileName, fileType } = payload;
    if (!phone || (!message && !fileUrl)) return json({ error: "phone e message ou fileUrl são obrigatórios" }, 400, origin);

    const media = Boolean(fileUrl);
    const requestedMediaType = fileType?.split("/")[0] || "document";
    const mediaType = ["image", "video", "audio"].includes(requestedMediaType) ? requestedMediaType : "document";
    const endpoint = media ? "sendMedia" : "sendText";
    const body = media
      ? { number: phone, mediatype: mediaType, media: fileUrl, caption: caption || "", fileName: fileName || "arquivo" }
      : { number: phone, text: message };
    const { response, data } = await evolutionRequest(config, `/message/${endpoint}/${encodeURIComponent(config.instance)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorMessage = data?.message || data?.error || data?.response?.message || data?.response?.error || `A Evolution API recusou o envio (HTTP ${response.status})`;
      return json({ error: errorMessage, rejected: true }, response.status, origin);
    }
    return json({ success: true, data }, 200, origin);
  } catch (error) {
    console.error("whatsapp-send error:", error);
    const diagnostic = error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240);
    return json({ error: "Erro ao comunicar com a Evolution API" }, 500, origin);
  }
});
