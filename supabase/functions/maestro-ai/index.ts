import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const APP_TIME_ZONE = "America/Manaus";
const origins = new Set([
  "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:4174", "http://localhost:4174",
  "http://127.0.0.1:4175", "http://localhost:4175", "http://127.0.0.1:5173", "http://localhost:5173",
  "https://dominiomaestro.com.br",
]);

type Session = { sub: string; exp: number; access_level: string; permissions: Record<string, unknown>; scope?: "user" | "group"; group_id?: string; authenticated?: boolean };
type Row = { entity: string; record_id: string; payload: Record<string, any>; source_updated_at: string | null };

function localDate(value = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const ACCESSIBLE_TAB_DEFAULTS: Record<string, string[]> = {
  master: ["Dashboard", "Projects", "Jobs", "Proposals", "Documentos", "Agenda", "ClientPortfolio", "Financial", "Conversations", "Instagram", "Reports", "AdsBrain", "Settings"],
  gestor: ["Dashboard", "Projects", "Jobs", "Proposals", "Documentos", "Agenda", "ClientPortfolio", "Conversations", "Instagram", "Reports", "AdsBrain"],
  collaborator: ["Dashboard", "Projects", "Jobs", "Agenda", "ClientPortfolio", "AdsBrain"],
};

const SAFE_FIELDS: Record<string, string[]> = {
  Client: ["id", "name", "status", "tier", "nps_score", "responsible", "responsible_id", "created_date", "updated_date"],
  Project: ["id", "name", "title", "status", "client_id", "client_name", "created_date", "updated_date"],
  Job: ["id", "number", "title", "content_type", "format", "status", "post_date", "project_id", "project_name", "client_id", "client_name", "responsible_id", "responsible_name", "stage_title", "stage_responsible_name", "briefing", "caption", "created_date", "updated_date", "completed_at"],
  Subtask: ["id", "job_id", "title", "status", "is_completed", "completed_at", "deadline", "order", "responsible_id", "responsible_name", "created_date", "updated_date"],
  Timesheet: ["id", "collaborator_id", "job_id", "job_title", "client_id", "client_name", "is_running", "started_at", "duration_minutes", "created_date", "updated_date"],
  AgendaEvent: ["id", "client_id", "date", "status", "title", "type", "activity_type", "created_date", "updated_date"],
  Proposal: ["id", "number", "title", "name", "client_id", "client_name", "status", "type", "total", "value", "valid_until", "created_date", "updated_date"],
  FeeContract: ["id", "client_id", "client_name", "status", "monthly_value", "value", "start_date", "end_date", "due_date", "created_date", "updated_date"],
  FinancialEntry: ["id", "type", "category", "description", "client_id", "client_name", "status", "amount", "due_date", "competence_date", "payment_date", "billing_date", "created_date", "updated_date"],
  Collaborator: ["id", "name", "full_name", "role", "access_level", "is_active", "color", "last_seen_at", "last_seen_page"],
  AppConfig: ["id", "key", "value", "created_date", "updated_date"],
};

const TOOL_DEFINITIONS = [
  { type: "function", name: "buscar_clientes", description: "Consulta o cadastro de clientes. Exclusiva para usuários Master autenticados.", parameters: { type: "object", properties: { busca: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "buscar_projetos", description: "Busca projetos por nome, cliente ou status, respeitando o escopo do colaborador.", parameters: { type: "object", properties: { busca: { type: "string" }, status: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "buscar_jobs", description: "Busca jobs por título, cliente, status ou período. Inclui briefing e legenda apenas para jobs visíveis ao colaborador.", parameters: { type: "object", properties: { busca: { type: "string" }, status: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "consultar_entregas", description: "Consulta entregas realizadas por uma pessoa. Uma entrega inclui o Job concluído ou qualquer Job que teve uma subtask finalizada pelo responsável no período informado.", parameters: { type: "object", properties: { responsavel: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "analisar_jobs_atrasados_responsavel", description: "Analisa Jobs ativos cuja data de postagem já venceu e que têm pelo menos uma subtask da pessoa indicada, concluída ou não. Mostra se a pessoa ainda tem subtask pendente ou se concluiu as próprias subtasks e outras pessoas estão impedindo o fechamento do Job.", parameters: { type: "object", properties: { responsavel: { type: "string" }, ate: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, required: ["responsavel"], additionalProperties: false } },
  { type: "function", name: "analisar_fluxo_operacional", description: "Interpreta o fluxo da agência: identifica gargalos por responsável e etapa, Jobs em risco e prioridades combinando atraso, subtasks abertas, prazo próximo e nível do cliente. Use para perguntas como quem está travando o fluxo, o que deve ser priorizado e se Elite deve passar à frente de Performance.", parameters: { type: "object", properties: { limite: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false } },
  { type: "function", name: "resolver_pessoa", description: "Resolve o nome, apelido ou abreviação de uma pessoa para o responsável canônico usado nos Jobs e subtarefas. Use antes de analisar tarefas de uma pessoa; se houver mais de um candidato, peça esclarecimento.", parameters: { type: "object", properties: { nome: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 10 } }, required: ["nome"], additionalProperties: false } },
  { type: "function", name: "buscar_tarefas", description: "Busca subtarefas abertas, atrasadas ou concluídas. Colaboradores comuns veem somente as próprias tarefas.", parameters: { type: "object", properties: { busca: { type: "string" }, somente_abertas: { type: "boolean" }, somente_atrasadas: { type: "boolean" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "consultar_dashboard", description: "Calcula indicadores operacionais atuais do Dashboard e informa a origem e a atualização dos dados.", parameters: { type: "object", properties: { periodo: { type: "string", enum: ["hoje", "7_dias", "30_dias"] } }, additionalProperties: false } },
  { type: "function", name: "consultar_relatorios", description: "Consulta indicadores operacionais dos relatórios. Valores financeiros só são retornados quando a permissão Financeiro está habilitada.", parameters: { type: "object", properties: { periodo: { type: "string" }, tipo: { type: "string" } }, additionalProperties: false } },
  { type: "function", name: "consultar_financeiro", description: "Consulta lançamentos, receitas, despesas e previsões financeiras. Exclusiva para colaborador autenticado no sistema com nível Master e Financeiro habilitado.", parameters: { type: "object", properties: { busca: { type: "string" }, tipo: { type: "string" }, status: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "consultar_comercial", description: "Consulta propostas comerciais. Contratos de clientes e valores financeiros exigem autenticação individual.", parameters: { type: "object", properties: { busca: { type: "string" }, status: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "consultar_configuracoes", description: "Consulta configurações operacionais não secretas e colaboradores. Exclusiva para Master com a área de configurações habilitada.", parameters: { type: "object", properties: { chave: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "consultar_contas_ads", description: "Consulta contas e status do Ads Brain sem expor tokens ou credenciais da Meta.", parameters: { type: "object", properties: { busca: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "consultar_metricas_campanhas", description: "Consulta métricas e campanhas sincronizadas do Ads Brain sem expor credenciais.", parameters: { type: "object", properties: { conta_id: { type: "string" }, busca: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "analisar_mix_marketing", description: "Analisa o mix de Meta Ads, Google Ads, Instagram orgânico, buscas e leads com um MMM Meridian. Retorna somente resultados agregados, prontidão, ROI, contribuição, saturação ou projeções quando o histórico for suficiente. Exige Ads Brain e autenticação Master porque o modelo usa investimento.", parameters: { type: "object", properties: { cliente_id: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, executar_modelo: { type: "boolean" } }, required: ["cliente_id"], additionalProperties: false } },
  { type: "function", name: "comparar_periodos", description: "Compara indicadores de produção entre dois períodos e explicita quando não há histórico de métricas de mídia persistido.", parameters: { type: "object", properties: { periodo_a_de: { type: "string" }, periodo_a_ate: { type: "string" }, periodo_b_de: { type: "string" }, periodo_b_ate: { type: "string" } }, additionalProperties: false } },
  { type: "function", name: "gerar_resumo_diario", description: "Prepara um resumo diário operacional com fatos e pendências para o gestor, sem alterar dados.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { type: "function", name: "gerar_feedback_cliente", description: "Prepara um feedback de cliente com base em NPS, jobs e entregas visíveis, sem enviar nem salvar mensagens.", parameters: { type: "object", properties: { cliente: { type: "string" }, foco: { type: "string" } }, additionalProperties: false } },
];

function decode(value: string) {
  return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
}

function normalizeLevel(value: unknown) {
  const level = String(value || "collaborator").toLowerCase();
  return level === "admin" ? "master" : level;
}

function isMaster(session: Session) {
  return normalizeLevel(session.access_level) === "master";
}

function isAuthenticatedMaster(session: Session) {
  return session.scope === "user" && session.authenticated === true && isMaster(session);
}

async function verifySession(token: string): Promise<Session | null> {
  if (!sessionSecret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(signature), character => character.charCodeAt(0)), new TextEncoder().encode(body));
  if (!valid) return null;
  let payload: Record<string, any>;
  try { payload = JSON.parse(decode(body)); } catch { return null; }
  if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.scope === "group" && typeof payload.group_id === "string" && payload.group_id.endsWith("@g.us")) {
    return {
      sub: String(payload.sub),
      exp: Number(payload.exp),
      access_level: "collaborator",
      permissions: { tabs: { Dashboard: true, Projects: true, Jobs: true, Proposals: true, Agenda: true, ClientPortfolio: true, Conversations: true, Instagram: true, Reports: true, AdsBrain: true } },
      scope: "group",
      group_id: payload.group_id,
      authenticated: false,
    };
  }
  const { data } = await db.from("maestro_collaborators").select("id,is_active,profile").eq("id", payload.sub).maybeSingle();
  if (!data?.is_active) return null;
  const profile = (data.profile || {}) as Record<string, unknown>;
  return { sub: String(data.id), exp: Number(payload.exp), access_level: normalizeLevel(profile.access_level || payload.access_level), permissions: (profile.permissions || {}) as Record<string, unknown>, scope: "user", authenticated: true };
}

function headers(origin: string) {
  return { "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://dominiomaestro.com.br", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(origin), "Content-Type": "application/json" } });
}

function hasTab(session: Session, tab: string) {
  const level = normalizeLevel(session.access_level);
  const configuredTabs = session.permissions.tabs && typeof session.permissions.tabs === "object" && !Array.isArray(session.permissions.tabs);
  const tabs = (configuredTabs ? session.permissions.tabs : {}) as Record<string, unknown>;
  if (tab === "Financial" && level !== "master") return false;
  if (tab === "Financial") return configuredTabs ? tabs.Financial === true : level === "master";
  if (tab === "Settings") return level === "master" && (configuredTabs ? tabs.Settings === true : true);
  if (tabs[tab] !== undefined) return tabs[tab] === true;
  return (ACCESSIBLE_TAB_DEFAULTS[level] || ACCESSIBLE_TAB_DEFAULTS.collaborator).includes(tab);
}

function canUse(session: Session, module: "financial" | "commercial" | "settings" | "reports" | "ads") {
  if (module === "financial") return isAuthenticatedMaster(session) && hasTab(session, "Financial");
  if (module === "commercial") return hasTab(session, "Proposals");
  if (module === "settings") return hasTab(session, "Settings");
  if (module === "reports") return hasTab(session, "Reports") || ["view", "full"].includes(String((session.permissions as any).reports || ""));
  return hasTab(session, "AdsBrain");
}

function projectRecord(entity: string, payload: Record<string, any>) {
  const fields = SAFE_FIELDS[entity] || ["id", "name", "title", "status", "created_date", "updated_date"];
  const result: Record<string, any> = Object.fromEntries(fields.filter(field => payload[field] !== undefined).map(field => [field, payload[field]]));
  for (const field of ["briefing", "caption"]) if (typeof result[field] === "string" && result[field].length > 2400) result[field] = `${result[field].slice(0, 2400)}…`;
  return result;
}

function withoutFinancialFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutFinancialFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/(spend|spent|budget|balance|amount|revenue|expense|income|profit|value|cost)/i.test(key))
    .map(([key, item]) => [key, withoutFinancialFields(item)]));
}

async function listRows(entity: string) {
  const { data, error } = await db.from("legacy_records").select("entity,record_id,payload,source_updated_at").eq("entity", entity).range(0, 9999);
  if (error) throw error;
  return (data || []) as Row[];
}

function normalizedText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function textMatches(value: unknown, search: string) {
  return !search || normalizedText(value).includes(normalizedText(search));
}

type PersonCandidate = { id: string; name: string; normalized: string; jobs: number; subtasks: number; aliases: Set<string>; jobIds: Set<string> };

function peopleFromOperational(operational: Awaited<ReturnType<typeof visibleOperational>>) {
  const byKey = new Map<string, PersonCandidate>();
  const add = (payload: Record<string, any>, kind: "job" | "subtask") => {
    const name = String(payload.responsible_name || payload.stage_responsible_name || "").trim();
    if (!name) return;
    const normalized = normalizedText(name);
    if (!normalized) return;
    const id = String(payload.responsible_id || "").trim();
    const key = id ? `id:${id}` : `name:${normalized}`;
    const current = byKey.get(key) || { id, name, normalized, jobs: 0, subtasks: 0, aliases: new Set<string>(), jobIds: new Set<string>() };
    if (name.length > current.name.length && !current.name.includes(name)) current.name = name;
    current.aliases.add(name);
    const jobId = String(kind === "job" ? payload.id : payload.job_id || "").trim();
    if (jobId) current.jobIds.add(jobId);
    if (kind === "subtask") current.subtasks += 1;
    current.jobs = current.jobIds.size;
    byKey.set(key, current);
  };
  operational.subtasks.forEach(row => add(row.payload, "subtask"));
  const merged = new Map<string, PersonCandidate>();
  for (const person of byKey.values()) {
    const key = person.id ? `id:${person.id}` : `name:${person.normalized}`;
    const current = merged.get(key);
    if (!current) merged.set(key, person);
    else {
      current.jobs += person.jobs;
      current.subtasks += person.subtasks;
      person.jobIds.forEach(jobId => current.jobIds.add(jobId));
      current.jobs = current.jobIds.size;
      person.aliases.forEach(alias => current.aliases.add(alias));
    }
  }
  return [...merged.values()];
}

function resolvePeople(name: string, operational: Awaited<ReturnType<typeof visibleOperational>>) {
  const query = normalizedText(name);
  if (!query) return [];
  return peopleFromOperational(operational)
    .map(person => {
      const names = [person.normalized, ...[...person.aliases].map(normalizedText)];
      const score = Math.max(...names.map(candidate => {
        if (candidate === query) return 100;
        if (candidate.startsWith(`${query} `) || query.startsWith(`${candidate} `)) return 92;
        if (candidate.startsWith(query) && query.length >= 3) return 82;
        if (candidate.split(" ").some(token => token === query)) return 78;
        if (candidate.split(" ").some(token => token.startsWith(query) && query.length >= 3)) return 70;
        if (candidate.includes(query) && query.length >= 4) return 55;
        return 0;
      }));
      return { ...person, score };
    })
    .filter(person => person.score > 0)
    .sort((a, b) => b.score - a.score || b.subtasks - a.subtasks || a.name.localeCompare(b.name, "pt-BR"));
}

function resolvedPersonMatches(payload: Record<string, any>, person: PersonCandidate) {
  const id = String(payload.responsible_id || "").trim();
  if (person.id && id) return id === person.id;
  const name = normalizedText(payload.responsible_name);
  return name === person.normalized || [...person.aliases].some(alias => normalizedText(alias) === name);
}

function dateMatches(value: unknown, from: string, until: string) {
  const date = String(value || "").slice(0, 10);
  return (!from || date >= from) && (!until || date <= until);
}

function localDateForValue(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : localDate(parsed);
}

function daysLate(value: unknown, today: string) {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) return 0;
  return Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000);
}

function clientForJob(job: Row, clients: Row[]) {
  const clientId = String(job.payload.client_id || "");
  return clients.find(row => row.record_id === clientId || String(row.payload.id || "") === clientId) || null;
}

async function visibleOperational(session: Session) {
  const [jobs, subtasks, projects, clients] = await Promise.all([listRows("Job"), listRows("Subtask"), listRows("Project"), listRows("Client")]);
  if (session.scope === "group") return { jobs, subtasks, projects, clients };
  const level = normalizeLevel(session.access_level);
  if (["master", "gestor"].includes(level)) return { jobs, subtasks, projects, clients };
  const ownSubtaskJobIds = new Set(subtasks.filter(row => String(row.payload.responsible_id || "") === session.sub).map(row => String(row.payload.job_id || "")));
  const visibleJobs = jobs.filter(row => ownSubtaskJobIds.has(String(row.record_id)));
  const visibleJobIds = new Set(visibleJobs.map(row => row.record_id));
  const visibleProjectIds = new Set(visibleJobs.map(row => String(row.payload.project_id || "")).filter(Boolean));
  const visibleClientIds = new Set(visibleJobs.map(row => String(row.payload.client_id || "")).filter(Boolean));
  return { jobs: visibleJobs, subtasks: subtasks.filter(row => visibleJobIds.has(String(row.payload.job_id || ""))), projects: projects.filter(row => visibleProjectIds.has(row.record_id)), clients: clients.filter(row => visibleClientIds.has(row.record_id)) };
}

function sourceMeta(extra: Record<string, unknown> = {}) {
  return { fonte: "Maestro", gerado_em: new Date().toISOString(), data_local: localDate(), fuso_horario: APP_TIME_ZONE, ...extra };
}

function countJobs(jobs: Row[], from = "", until = "") {
  return jobs.filter(row => dateMatches(row.payload.post_date || row.payload.created_date, from, until));
}

function isCompleted(payload: Record<string, any>) {
  return payload.is_completed === true || ["completed", "concluido", "concluída", "concluido"].includes(String(payload.status || "").toLowerCase());
}

function isOpenJob(payload: Record<string, any>) {
  const status = String(payload.status || "").toLowerCase();
  return !isCompleted(payload) && !["cancelled", "canceled", "archived", "arquivado", "cancelado"].includes(status);
}

function indexJobsById(jobs: Row[]) {
  const result = new Map<string, Row>();
  for (const job of jobs) {
    result.set(job.record_id, job);
    if (job.payload.id) result.set(String(job.payload.id), job);
  }
  return result;
}

async function financialSummary() {
  const rows = await listRows("FinancialEntry");
  const totals = rows.reduce((result, row) => {
    const amount = Number(row.payload.amount || 0);
    if (!Number.isFinite(amount)) return result;
    if (row.payload.type === "revenue") result.receitas += amount;
    if (row.payload.type === "expense") result.despesas += amount;
    return result;
  }, { receitas: 0, despesas: 0 });
  return { ...totals, resultado: totals.receitas - totals.despesas, total_lancamentos: rows.length };
}

type ToolCache = { operational?: Promise<Awaited<ReturnType<typeof visibleOperational>>> };

async function executeTool(name: string, args: Record<string, any>, session: Session, cache: ToolCache): Promise<Record<string, unknown>> {
  const limit = Math.min(100, Math.max(1, Number(args.limite) || 20));
  const search = String(args.busca || "").trim();
  const operationalNames = new Set(["buscar_clientes", "buscar_projetos", "buscar_jobs", "resolver_pessoa", "consultar_entregas", "analisar_jobs_atrasados_responsavel", "analisar_fluxo_operacional", "buscar_tarefas", "consultar_dashboard", "consultar_relatorios", "comparar_periodos", "gerar_resumo_diario", "gerar_feedback_cliente"]);
  const operational = operationalNames.has(name) ? await (cache.operational ||= visibleOperational(session)) : { jobs: [], subtasks: [], projects: [], clients: [] };
  if (name === "buscar_clientes") {
    if (!isAuthenticatedMaster(session)) return { acesso_negado: true, motivo: "O cadastro de clientes exige autenticação no cadastro de um colaborador com nível Master." };
    const rows = operational.clients.filter(row => textMatches(row.payload.name, search)).slice(0, limit);
    return { ...sourceMeta(), total: rows.length, clientes: rows.map(row => projectRecord("Client", row.payload)) };
  }
  if (name === "buscar_projetos") {
    const rows = operational.projects.filter(row => textMatches(`${row.payload.name} ${row.payload.title} ${row.payload.client_name}`, search) && textMatches(row.payload.status, String(args.status || ""))).slice(0, limit);
    return { ...sourceMeta(), total: rows.length, projetos: rows.map(row => projectRecord("Project", row.payload)) };
  }
  if (name === "buscar_jobs") {
    const rows = operational.jobs.filter(row => textMatches(`${row.payload.title} ${row.payload.client_name} ${row.payload.project_name}`, search) && textMatches(row.payload.status, String(args.status || "")) && dateMatches(row.payload.post_date, String(args.de || ""), String(args.ate || ""))).slice(0, limit);
    return { ...sourceMeta(), total: rows.length, jobs: rows.map(row => projectRecord("Job", row.payload)) };
  }
  if (name === "resolver_pessoa") {
    const nome = String(args.nome || "").trim();
    const candidates = resolvePeople(nome, operational).slice(0, Math.min(10, Math.max(1, Number(args.limite) || 5)));
    return {
      ...sourceMeta({ busca: nome }),
      encontrado: candidates.length > 0,
      ambiguo: candidates.length > 1 && candidates[0].score < 100 && candidates[1].score >= candidates[0].score - 8,
      candidatos: candidates.map(person => ({ id: person.id || undefined, nome: person.name, correspondencia: person.score >= 90 ? "exata ou nome completo" : person.score >= 70 ? "abreviação ou primeiro nome" : "parcial", jobs: person.jobs, subtasks: person.subtasks })),
      instrucao: candidates.length > 1 && candidates[0].score < 100 && candidates[1].score >= candidates[0].score - 8
        ? "Há mais de uma pessoa compatível. Peça o nome completo antes de responder sobre uma pessoa específica."
        : "Use o nome canônico e o id retornados nas próximas consultas; não associe esse resultado ao remetente automaticamente.",
    };
  }
  if (name === "consultar_entregas") {
    const responsible = String(args.responsavel || "").trim();
    const from = String(args.de || localDate());
    const until = String(args.ate || from);
    const jobIndex = indexJobsById(operational.jobs);
    const resolved = responsible ? resolvePeople(responsible, operational) : [];
    const selected = resolved.length && !(resolved.length > 1 && resolved[0].score < 100 && resolved[1].score >= resolved[0].score - 8) ? resolved[0] : null;
    if (responsible && !selected) return { encontrado: false, ambiguo: resolved.length > 1, candidatos: resolved.slice(0, 5).map(person => person.name), motivo: resolved.length > 1 ? "Encontrei mais de uma pessoa compatível; informe o nome completo." : "Não encontrei esse responsável nos Jobs ou subtarefas visíveis." };
    const deliveries = new Map<string, { job: Row; subtasks: Row[]; completed_at: string }>();
    for (const subtask of operational.subtasks) {
      if (!isCompleted(subtask.payload)) continue;
      if (selected && !resolvedPersonMatches(subtask.payload, selected)) continue;
      const completedAt = subtask.payload.completed_at || subtask.payload.completed_date || subtask.payload.updated_date;
      const completedDate = localDateForValue(completedAt);
      if (!dateMatches(completedDate, from, until)) continue;
      const job = jobIndex.get(String(subtask.payload.job_id || ""));
      if (!job) continue;
      const current = deliveries.get(job.record_id) || { job, subtasks: [], completed_at: String(completedAt || "") };
      current.subtasks.push(subtask);
      if (!current.completed_at || String(completedAt || "") > current.completed_at) current.completed_at = String(completedAt || "");
      deliveries.set(job.record_id, current);
    }
    for (const job of operational.jobs) {
      if (!isCompleted(job.payload)) continue;
      // Jobs do not have an owner in the operational model. For a named
      // person, delivery is proven only by a completed subtask above.
      if (selected) continue;
      const completedAt = job.payload.completed_at || job.payload.completed_date || job.payload.updated_date;
      if (!dateMatches(localDateForValue(completedAt), from, until)) continue;
      const current = deliveries.get(job.record_id) || { job, subtasks: [], completed_at: String(completedAt || "") };
      if (!current.completed_at) current.completed_at = String(completedAt || "");
      deliveries.set(job.record_id, current);
    }
    const rows = [...deliveries.values()].slice(0, limit);
    return {
      ...sourceMeta({ periodo: `${from} a ${until}`, responsavel_resolvido: selected?.name || responsible || undefined }),
      total: rows.length,
      entregas: rows.map(item => ({
        job: projectRecord("Job", item.job.payload),
        entregue_em: item.completed_at,
        subtasks_finalizadas: item.subtasks.map(subtask => projectRecord("Subtask", subtask.payload)),
        criterio: item.subtasks.length ? "Subtask finalizada pelo responsável" : "Job finalizado",
      })),
    };
  }
  if (name === "analisar_jobs_atrasados_responsavel") {
    const responsible = String(args.responsavel || "").trim();
    if (!responsible) return { erro: "Informe o responsável para analisar os Jobs atrasados." };
    const referenceDate = String(args.ate || localDate()).slice(0, 10);
    const resolved = resolvePeople(responsible, operational);
    const selected = resolved.length && !(resolved.length > 1 && resolved[0].score < 100 && resolved[1].score >= resolved[0].score - 8) ? resolved[0] : null;
    if (!selected) return { encontrado: false, ambiguo: resolved.length > 1, candidatos: resolved.slice(0, 5).map(person => person.name), motivo: resolved.length > 1 ? "Encontrei mais de uma pessoa compatível; informe o nome completo." : "Não encontrei esse responsável nos Jobs ou subtarefas visíveis." };
    const jobMap = indexJobsById(operational.jobs);
    const subtasksByJob = new Map<string, Row[]>();
    for (const subtask of operational.subtasks) {
      const job = jobMap.get(String(subtask.payload.job_id || ""));
      if (!job) continue;
      const current = subtasksByJob.get(job.record_id) || [];
      current.push(subtask);
      subtasksByJob.set(job.record_id, current);
    }
    const jobs = operational.jobs.filter(job => {
      const postDate = String(job.payload.post_date || "").slice(0, 10);
      if (!isOpenJob(job.payload) || !/^\d{4}-\d{2}-\d{2}$/.test(postDate) || postDate >= referenceDate) return false;
      return (subtasksByJob.get(job.record_id) || []).some(task => resolvedPersonMatches(task.payload, selected));
    }).sort((a, b) => String(a.payload.post_date || "").localeCompare(String(b.payload.post_date || "")));
    const rows = jobs.slice(0, limit).map(job => {
      const allSubtasks = subtasksByJob.get(job.record_id) || [];
      const personSubtasks = allSubtasks.filter(task => resolvedPersonMatches(task.payload, selected));
      const personOpen = personSubtasks.filter(task => !isCompleted(task.payload));
      const personDone = personSubtasks.filter(task => isCompleted(task.payload));
      const otherOpen = allSubtasks.filter(task => !isCompleted(task.payload) && !resolvedPersonMatches(task.payload, selected));
      const otherResponsibles = [...new Set(otherOpen.map(task => String(task.payload.responsible_name || "Sem responsável").trim() || "Sem responsável"))];
      const client = clientForJob(job, operational.clients);
      const reason = personOpen.length
        ? "A pessoa ainda tem subtask pendente neste Job."
        : otherOpen.length
          ? "As subtasks da pessoa estão concluídas; outras pessoas ainda têm subtasks pendentes."
          : "As subtasks da pessoa estão concluídas e não há outra subtask pendente; o Job continua aberto.";
      return {
        cliente: client?.payload.name || job.payload.client_name || "Sem cliente",
        nivel_cliente: String(client?.payload.tier || "performance").toLowerCase() === "elite" ? "Elite" : "Performance",
        job: projectRecord("Job", job.payload),
        dias_de_atraso: daysLate(job.payload.post_date, referenceDate),
        subtasks_da_pessoa: { total: personSubtasks.length, concluidas: personDone.length, pendentes: personOpen.length, itens_pendentes: personOpen.map(task => projectRecord("Subtask", task.payload)) },
        outras_subtasks_pendentes: { total: otherOpen.length, responsaveis: otherResponsibles, itens: otherOpen.slice(0, 20).map(task => projectRecord("Subtask", task.payload)) },
        leitura: reason,
      };
    });
    const comPendenciaDaPessoa = rows.filter(row => row.subtasks_da_pessoa.pendentes > 0).length;
    const pessoaConcluiuOutrosAtrasam = rows.filter(row => row.subtasks_da_pessoa.pendentes === 0 && row.outras_subtasks_pendentes.total > 0).length;
    const semOutraPendencia = rows.filter(row => row.subtasks_da_pessoa.pendentes === 0 && row.outras_subtasks_pendentes.total === 0).length;
    return {
      ...sourceMeta({ periodo: `Jobs com postagem anterior a ${referenceDate}`, responsavel: selected.name, responsavel_id: selected.id || undefined }),
      total: rows.length,
      resumo: { jobs_atrasados_com_subtask_da_pessoa: jobs.length, jobs_com_subtask_da_pessoa_pendente: comPendenciaDaPessoa, jobs_em_que_pessoa_concluiu_mas_outros_atrasam: pessoaConcluiuOutrosAtrasam, jobs_abertos_sem_subtask_pendente: semOutraPendencia },
      jobs: rows,
      criterio: "Job ativo com data de postagem anterior à data de referência e pelo menos uma subtask atribuída à pessoa, concluída ou não. Jobs concluídos, cancelados ou arquivados ficam fora da contagem.",
    };
  }
  if (name === "analisar_fluxo_operacional") {
    const today = localDate();
    const limit = Math.min(20, Math.max(5, Number(args.limite) || 10));
    const activeJobs = operational.jobs.filter(row => {
      const status = String(row.payload.status || "").toLowerCase();
      return !isCompleted(row.payload) && !["cancelled", "canceled", "archived"].includes(status);
    });
    const openTasks = operational.subtasks.filter(row => !isCompleted(row.payload));
    const overdueTasks = openTasks.filter(row => daysLate(row.payload.deadline, today) > 0);
    const clientsByJob = new Map(activeJobs.map(job => [job.record_id, clientForJob(job, operational.clients)]));
    const jobTasks = new Map<string, Row[]>();
    for (const task of operational.subtasks) {
      const jobId = String(task.payload.job_id || "");
      if (!jobId) continue;
      const current = jobTasks.get(jobId) || [];
      current.push(task);
      jobTasks.set(jobId, current);
    }
    const responsibleMap = new Map<string, { responsavel: string; tarefas_abertas: number; tarefas_atrasadas: number; jobs: Set<string> }>();
    for (const task of openTasks) {
      const responsible = String(task.payload.responsible_name || "Sem responsável").trim() || "Sem responsável";
      const current = responsibleMap.get(responsible) || { responsavel: responsible, tarefas_abertas: 0, tarefas_atrasadas: 0, jobs: new Set<string>() };
      current.tarefas_abertas += 1;
      current.tarefas_atrasadas += daysLate(task.payload.deadline, today) > 0 ? 1 : 0;
      if (task.payload.job_id) current.jobs.add(String(task.payload.job_id));
      responsibleMap.set(responsible, current);
    }
    const stageMap = new Map<string, { etapa: string; tarefas_abertas: number; tarefas_atrasadas: number; jobs: Set<string>; responsaveis: Set<string> }>();
    for (const task of openTasks) {
      const job = activeJobs.find(row => row.record_id === String(task.payload.job_id || ""));
      const stage = String(task.payload.stage_title || task.payload.stage || task.payload.title || job?.payload.status || "Sem etapa").trim() || "Sem etapa";
      const responsible = String(task.payload.responsible_name || "Sem responsável").trim() || "Sem responsável";
      const current = stageMap.get(stage) || { etapa: stage, tarefas_abertas: 0, tarefas_atrasadas: 0, jobs: new Set<string>(), responsaveis: new Set<string>() };
      current.tarefas_abertas += 1;
      current.tarefas_atrasadas += daysLate(task.payload.deadline, today) > 0 ? 1 : 0;
      if (task.payload.job_id) current.jobs.add(String(task.payload.job_id));
      current.responsaveis.add(responsible);
      stageMap.set(stage, current);
    }
    const priorities = activeJobs.map(job => {
      const client = clientsByJob.get(job.record_id);
      const tier = String(client?.payload.tier || "performance").toLowerCase() === "elite" ? "Elite" : "Performance";
      const tasks = (jobTasks.get(job.record_id) || []).filter(task => !isCompleted(task.payload));
      const lateTasks = tasks.filter(task => daysLate(task.payload.deadline, today) > 0);
      const jobLate = daysLate(job.payload.post_date, today);
      const dueSoon = !jobLate && dateMatches(job.payload.post_date, today, localDate(new Date(Date.now() + 5 * 86400000)));
      const score = (jobLate ? 45 + Math.min(jobLate, 10) * 4 : 0) + lateTasks.length * 12 + tasks.length * 3 + (dueSoon ? 25 : 0) + (tier === "Elite" ? 20 : 0);
      const reasons = [
        jobLate ? `${jobLate}d de atraso na postagem` : "",
        lateTasks.length ? `${lateTasks.length} subtask(s) atrasada(s)` : "",
        dueSoon ? "postagem nos próximos 5 dias" : "",
        tier === "Elite" ? "cliente Elite como critério de desempate" : "",
      ].filter(Boolean);
      return { score, job, client, tier, tasks, lateTasks, jobLate, reasons };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    const responsaveis = [...responsibleMap.values()]
      .sort((a, b) => (b.tarefas_atrasadas * 3 + b.tarefas_abertas) - (a.tarefas_atrasadas * 3 + a.tarefas_abertas))
      .slice(0, 8)
      .map(item => ({ responsavel: item.responsavel, tarefas_abertas: item.tarefas_abertas, tarefas_atrasadas: item.tarefas_atrasadas, jobs_afetados: item.jobs.size, indice_bloqueio: item.tarefas_atrasadas * 3 + item.tarefas_abertas }));
    const etapas = [...stageMap.values()]
      .sort((a, b) => (b.tarefas_atrasadas * 3 + b.tarefas_abertas) - (a.tarefas_atrasadas * 3 + a.tarefas_abertas))
      .slice(0, 8)
      .map(item => ({ etapa: item.etapa, tarefas_abertas: item.tarefas_abertas, tarefas_atrasadas: item.tarefas_atrasadas, jobs_afetados: item.jobs.size, responsaveis: [...item.responsaveis].slice(0, 5) }));
    return {
      ...sourceMeta({ modulo: "Operação", periodo: "atual" }),
      resumo: { jobs_ativos: activeJobs.length, jobs_atrasados: activeJobs.filter(job => daysLate(job.payload.post_date, today) > 0).length, tarefas_abertas: openTasks.length, tarefas_atrasadas: overdueTasks.length },
      gargalos: { por_responsavel: responsaveis, por_etapa: etapas },
      prioridades: priorities.map(item => ({ cliente: item.client?.payload.name || item.job.payload.client_name || "Sem cliente", nivel_cliente: item.tier, job: projectRecord("Job", item.job.payload), tarefas_abertas: item.tasks.length, tarefas_atrasadas: item.lateTasks.length, pontuacao: item.score, motivo: item.reasons })),
      regra_prioridade: "Elite não passa automaticamente à frente de um Performance em atraso. Primeiro vêm risco e prazo; entre casos equivalentes, Elite é o desempate. Essa regra pode ser alterada por uma política formal da agência.",
      leitura: "Os nomes indicam onde o fluxo está acumulando trabalho; isso aponta gargalos operacionais, não culpa individual. Valide a causa antes de redistribuir tarefas.",
    };
  }
  if (name === "buscar_tarefas") {
    const today = localDate();
    const rows = operational.subtasks.filter(row => textMatches(`${row.payload.title} ${row.payload.responsible_name}`, search))
      .filter(row => !args.somente_abertas || !isCompleted(row.payload))
      .filter(row => !args.somente_atrasadas || (String(row.payload.deadline || "") < today && !isCompleted(row.payload))).slice(0, limit);
    return { ...sourceMeta(), total: rows.length, tarefas: rows.map(row => projectRecord("Subtask", row.payload)) };
  }
  if (name === "consultar_dashboard") {
    const period = String(args.periodo || "hoje");
    const today = localDate();
    const from = period === "30_dias" ? localDate(new Date(Date.now() - 29 * 86400000)) : period === "7_dias" ? localDate(new Date(Date.now() - 6 * 86400000)) : today;
    const jobs = countJobs(operational.jobs, from, today);
    const tasksOpen = operational.subtasks.filter(row => !isCompleted(row.payload));
    return { ...sourceMeta({ periodo: period }), indicadores: { clientes_visiveis: operational.clients.length, projetos_visiveis: operational.projects.length, jobs_no_periodo: jobs.length, tarefas_abertas: tasksOpen.length, jobs_atrasados: operational.jobs.filter(row => String(row.payload.post_date || "") < today && !isCompleted(row.payload)).length, tarefas_atrasadas: tasksOpen.filter(row => String(row.payload.deadline || "") < today).length } };
  }
  if (name === "consultar_relatorios") {
    if (!canUse(session, "reports")) return { acesso_negado: true, motivo: "A aba Relatórios não está habilitada para este usuário." };
    const today = localDate();
    const openTasks = operational.subtasks.filter(row => !isCompleted(row.payload));
    const report: Record<string, unknown> = { ...sourceMeta({ periodo: String(args.periodo || "atual") }), producao: { total_jobs: operational.jobs.length, jobs_concluidos: operational.jobs.filter(row => isCompleted(row.payload)).length, tarefas_abertas: openTasks.length, tarefas_atrasadas: openTasks.filter(row => String(row.payload.deadline || "") < today).length } };
    if (canUse(session, "financial")) report.financeiro = await financialSummary();
    return report;
  }
  if (name === "consultar_financeiro") {
    if (!canUse(session, "financial")) return { acesso_negado: true, motivo: "Informações financeiras exigem usuário Master autenticado e a aba Financeiro habilitada." };
    const rows = (await listRows("FinancialEntry")).filter(row => textMatches(`${row.payload.description} ${row.payload.client_name} ${row.payload.category}`, search) && textMatches(row.payload.type, String(args.tipo || "")) && textMatches(row.payload.status, String(args.status || "")) && dateMatches(row.payload.due_date || row.payload.competence_date, String(args.de || ""), String(args.ate || ""))).slice(0, limit);
    return { ...sourceMeta({ modulo: "Financeiro" }), total: rows.length, lancamentos: rows.map(row => projectRecord("FinancialEntry", row.payload)) };
  }
  if (name === "consultar_comercial") {
    if (!canUse(session, "commercial")) return { acesso_negado: true, motivo: "A área Comercial exige a aba Propostas habilitada para este usuário." };
    const proposals = await listRows("Proposal");
    const matches = (row: Row) => textMatches(`${row.payload.title} ${row.payload.name} ${row.payload.client_name}`, search) && textMatches(row.payload.status, String(args.status || ""));
    const result: Record<string, unknown> = { ...sourceMeta({ modulo: "Comercial" }), propostas: proposals.filter(matches).slice(0, limit).map(row => {
      const proposal = projectRecord("Proposal", row.payload);
      if (!isAuthenticatedMaster(session)) {
        delete proposal.total;
        delete proposal.value;
      }
      return proposal;
    }) };
    if (!isAuthenticatedMaster(session)) {
      result.contratos = [];
      result.contratos_bloqueados = true;
      result.motivo_contratos = "A consulta de contratos de clientes é exclusiva para usuários Master autenticados.";
    } else {
      const contracts = await listRows("FeeContract");
      result.contratos = contracts.filter(matches).slice(0, limit).map(row => projectRecord("FeeContract", row.payload));
    }
    return result;
  }
  if (name === "consultar_configuracoes") {
    if (!canUse(session, "settings")) return { acesso_negado: true, motivo: "Configurações são restritas ao Master com a área habilitada." };
    const key = String(args.chave || "").trim();
    const [configs, collaborators] = await Promise.all([listRows("AppConfig"), listRows("Collaborator")]);
    const safeConfigKeys = new Set(["system_timezone", "job_statuses_v2", "agenda_activities", "collaborator_roles"]);
    return { ...sourceMeta({ modulo: "Configurações" }), configuracoes: configs.filter(row => safeConfigKeys.has(String(row.payload.key || "")) && textMatches(row.payload.key, key)).slice(0, limit).map(row => projectRecord("AppConfig", row.payload)), colaboradores: collaborators.slice(0, limit).map(row => projectRecord("Collaborator", row.payload)) };
  }
  if (name === "consultar_contas_ads" || name === "consultar_metricas_campanhas") {
    if (!canUse(session, "ads")) return { acesso_negado: true, motivo: "A aba Ads Brain não está habilitada para este usuário." };
    let query = db.from("maestro_ads_accounts").select("id,network,client_name,display_name,external_account_id,currency,account_status,balance,minimum_balance,spending_limit,amount_spent,metrics_data,campaigns_data,last_synced_at").order("updated_at", { ascending: false });
    if (args.conta_id) query = query.eq("id", String(args.conta_id));
    const { data, error } = await query.limit(limit);
    if (error) throw error;
    const accounts = (data || []).filter(account => textMatches(`${account.client_name} ${account.display_name} ${account.external_account_id}`, search));
    if (name === "consultar_contas_ads") return { ...sourceMeta({ modulo: "Ads Brain" }), total: accounts.length, contas: accounts.map(account => ({ id: account.id, cliente: account.client_name, conta: account.display_name, rede: account.network, moeda: account.currency, status: account.account_status, ...(isAuthenticatedMaster(session) ? { saldo: account.balance, limite_minimo: account.minimum_balance, limite_gasto: account.spending_limit, gasto_total: account.amount_spent } : {}), ultima_sincronizacao: account.last_synced_at })) };
    return { ...sourceMeta({ modulo: "Ads Brain" }), total: accounts.length, contas: accounts.map(account => ({ id: account.id, cliente: account.client_name, ultima_sincronizacao: account.last_synced_at, metricas: isAuthenticatedMaster(session) ? account.metrics_data || {} : withoutFinancialFields(account.metrics_data || {}), campanhas: (Array.isArray(account.campaigns_data) ? account.campaigns_data : []).filter(campaign => textMatches(campaign?.name, search)).slice(0, 50).map(campaign => ({ id: campaign?.id, nome: campaign?.name, status: campaign?.effective_status || campaign?.status, ...(isAuthenticatedMaster(session) ? { investimento: campaign?.insights?.data?.[0]?.spend } : {}), impressoes: campaign?.insights?.data?.[0]?.impressions, cliques: campaign?.insights?.data?.[0]?.clicks, ctr: campaign?.insights?.data?.[0]?.ctr, cpc: campaign?.insights?.data?.[0]?.cpc, cpm: campaign?.insights?.data?.[0]?.cpm })) })) };
  }
  if (name === "analisar_mix_marketing") {
    if (!canUse(session, "ads")) return { acesso_negado: true, motivo: "A aba Ads Brain não está habilitada para este usuário." };
    if (!isAuthenticatedMaster(session)) return { acesso_negado: true, motivo: "A análise de mix usa investimento e exige autenticação individual de usuário Master." };
    const serviceUrl = Deno.env.get("MMM_SERVICE_URL")?.replace(/\/$/, "");
    const serviceToken = Deno.env.get("MMM_SERVICE_TOKEN") || "";
    const clientId = String(args.cliente_id || "").trim();
    if (!serviceUrl || !serviceToken) return { configuracao_pendente: true, motivo: "O serviço seguro de Marketing Mix ainda não foi configurado neste ambiente." };
    if (!clientId) return { erro: "Informe o cliente_id para analisar o mix de marketing." };
    const payload = { client_id: clientId, start: args.de || undefined, end: args.ate || undefined, run_model: args.executar_modelo === true };
    try {
      const response = await fetch(`${serviceUrl}/v1/mmm/analyze`, { method: "POST", headers: { "Content-Type": "application/json", "X-MMM-Service-Token": serviceToken }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
      const result = await response.json();
      if (!response.ok) return { erro: "O serviço de Marketing Mix não respondeu corretamente.", status: response.status };
      return { ...sourceMeta({ modulo: "Marketing Mix Model", cliente_id: clientId }), ...result };
    } catch (error) {
      console.error("Marketing mix service error:", error);
      return { erro: "Não foi possível consultar o serviço de Marketing Mix agora." };
    }
  }
  if (name === "comparar_periodos") {
    const first = countJobs(operational.jobs, String(args.periodo_a_de || ""), String(args.periodo_a_ate || ""));
    const second = countJobs(operational.jobs, String(args.periodo_b_de || ""), String(args.periodo_b_ate || ""));
    return { ...sourceMeta({ periodo_a: `${args.periodo_a_de || ""} a ${args.periodo_a_ate || ""}`, periodo_b: `${args.periodo_b_de || ""} a ${args.periodo_b_ate || ""}` }), comparativo: { periodo_a: { jobs: first.length, concluidos: first.filter(row => isCompleted(row.payload)).length }, periodo_b: { jobs: second.length, concluidos: second.filter(row => isCompleted(row.payload)).length } }, limitacao: "O histórico diário de métricas do Ads Brain ainda não está persistido; a comparação de mídia será habilitada quando essa série histórica for criada." };
  }
  if (name === "gerar_resumo_diario") {
    const dashboard = await executeTool("consultar_dashboard", { periodo: "hoje" }, session, cache);
    const today = localDate();
    const overdue = operational.jobs.filter(row => String(row.payload.post_date || "") < today && !isCompleted(row.payload)).slice(0, 10);
    const entregas = await executeTool("consultar_entregas", { de: today, ate: today, limite: 100 }, session, cache);
    return { ...sourceMeta({ periodo: "hoje" }), dashboard, entregas, pendencias: overdue.map(row => projectRecord("Job", row.payload)) };
  }
  if (name === "gerar_feedback_cliente") {
    if (!isAuthenticatedMaster(session)) return { acesso_negado: true, motivo: "O cadastro e o feedback detalhado de clientes exigem autenticação no cadastro de um colaborador com nível Master." };
    const client = operational.clients.find(row => textMatches(row.payload.name, String(args.cliente || "").trim()));
    if (!client) return { encontrado: false, motivo: "Não encontrei esse cliente no escopo do usuário." };
    const jobs = operational.jobs.filter(row => String(row.payload.client_id || "") === client.record_id).slice(0, 30);
    return { ...sourceMeta({ cliente: client.payload.name, foco: String(args.foco || "geral") }), cliente: projectRecord("Client", client.payload), entregas: jobs.map(row => projectRecord("Job", row.payload)), aviso: "Feedback apenas preparado para revisão; nenhuma mensagem foi enviada ou salva." };
  }
  return { erro: `Ferramenta não suportada: ${name}` };
}

function safeClientContext(context: unknown) {
  const value = (context || {}) as Record<string, any>;
  const job = value.job || {};
  return { pagina: String(value.page || ""), tarefa: String(value.task || ""), job: Object.fromEntries(["id", "title", "client_id", "client_name", "project_id", "project_name", "status", "post_date"].filter(key => job[key] !== undefined).map(key => [key, job[key]])) };
}

function outputText(result: any) {
  return result.output_text || (Array.isArray(result.output) ? result.output.flatMap((item: { content?: Array<{ text?: string }> }) => item.content || []).map((item: { text?: string }) => item.text || "").filter(Boolean).join("\n") : "");
}

async function askOpenAI(input: any[], session: Session, responseSchema?: Record<string, unknown>, allowWebSearch = false) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("A integração com o ChatGPT ainda não foi configurada.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
      reasoning: { effort: Deno.env.get("OPENAI_REASONING_EFFORT") || "high" },
      text: {
        verbosity: Deno.env.get("OPENAI_TEXT_VERBOSITY") || "medium",
        ...(responseSchema ? { format: { type: "json_schema", name: "maestro_structured_output", schema: responseSchema, strict: false } } : {}),
      },
      store: false,
      instructions: `Você é o ChatGPT integrado ao Maestro, uma plataforma brasileira para agências. Responda em português, com objetividade e contexto suficiente para uma decisão. A data de referência da empresa é ${localDate()} no fuso ${APP_TIME_ZONE}; interprete corretamente hoje, ontem e amanhã a partir dessa data, sem usar UTC. Mantenha o contexto da conversa e resolva referências como "ela", "ele", "esse job" e "amanhã" usando as mensagens anteriores. Quando uma pessoa for citada por nome, apelido ou abreviação, primeiro use resolver_pessoa e associe a consulta ao nome canônico retornado; nunca escolha silenciosamente entre candidatos ambíguos e nunca confunda a pessoa citada com o remetente da mensagem. Quando alguém perguntar quantos Jobs atrasados uma pessoa tem, interprete "atrasado" como data de postagem vencida: resolva a pessoa e use analisar_jobs_atrasados_responsavel, contando apenas Jobs ativos com pelo menos uma subtask da pessoa, concluída ou não. Explique separadamente se a pessoa ainda tem subtask pendente, se concluiu as próprias subtasks mas outras pessoas ainda bloqueiam o fechamento, ou se o Job segue aberto sem subtask pendente. Não confunda quantidade de subtasks atrasadas com quantidade de Jobs atrasados. Quando alguém perguntar se uma pessoa entregou, concluiu ou fez um Job em um período, resolva a pessoa e use consultar_entregas: considere como entrega um Job finalizado ou qualquer subtask finalizada por essa pessoa dentro do Job; não conclua que não houve entrega olhando apenas o status ou a data de postagem do Job. Quando a pergunta envolver gargalo, fluxo, prioridade, quem está travando a operação ou Elite versus Performance, use analisar_fluxo_operacional e interprete os resultados: explique o que é fato, o que é risco e qual ação vem primeiro; não acuse pessoas sem evidência. Quando a pergunta envolver influência de Meta Ads, Google Ads, Instagram orgânico, buscas ou leads sobre um resultado, primeiro resolva o cliente por buscar_clientes quando ele vier por nome e depois use analisar_mix_marketing com o cliente_id retornado; explique a diferença entre dados observados, contribuição estimada, ROI, saturação e projeção, e diga claramente quando a série histórica não for suficiente. Não trate correlação como causalidade e não transforme cliente Elite em prioridade automática sem uma regra formal da agência. Consulte ferramentas antes de afirmar dados do sistema. Use somente os dados retornados pelas ferramentas e informe fonte, período e última sincronização quando existirem. Separe fatos observados, interpretação e recomendação. Nunca invente números, nunca exponha credenciais e nunca diga que alterou algo. Ferramentas disponíveis são somente de leitura e preparação: qualquer criação, edição, envio ou exclusão deve ser apresentada como rascunho e exigir confirmação explícita do usuário em uma etapa posterior. O usuário possui nível ${session.access_level}; respeite os bloqueios de acesso retornados pelas ferramentas.`,
      tools: [...TOOL_DEFINITIONS, ...(allowWebSearch ? [{ type: "web_search" }] : [])],
      parallel_tool_calls: true,
      input,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || "Não foi possível consultar o ChatGPT.");
  return result;
}

async function logQuery(session: Session, toolsUsed: string[]) {
  try {
    const now = new Date().toISOString();
    await db.from("legacy_records").insert({
      entity: "AIQueryLog",
      record_id: crypto.randomUUID().replaceAll("-", ""),
      payload: { collaborator_id: session.sub, access_level: session.access_level, tools: toolsUsed, created_date: now },
      source_created_at: now,
      source_updated_at: now,
    });
  } catch (error) {
    console.warn("Maestro AI audit log failed:", error);
  }
}

Deno.serve(async request => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = token ? await verifySession(token) : null;
    if (!session) return json({ error: "Sessão inválida ou expirada" }, 401, origin);
    const body = await request.json() as Record<string, any>;
    if (typeof body.message !== "string" || !body.message.trim()) return json({ error: "Mensagem obrigatória" }, 400, origin);
    const history = Array.isArray(body.history) ? body.history.slice(-12).map(item => ({ role: item.role === "assistant" ? "assistant" : "user", content: String(item.content || "").slice(0, 6000) })) : [];
    const responseSchema = body.response_json_schema && typeof body.response_json_schema === "object" ? body.response_json_schema : undefined;
    const allowWebSearch = body.context?.allow_web_search === true;
    const input: any[] = [...history, { role: "user", content: `${body.message.trim()}\n\nContexto de navegação (não é fonte de dados): ${JSON.stringify(safeClientContext(body.context))}` }];
    let result = await askOpenAI(input, session, responseSchema, allowWebSearch);
    const usedTools = new Set<string>();
    const toolCache: ToolCache = {};
    for (let round = 0; round < 4; round += 1) {
    const calls = Array.isArray(result.output) ? result.output.filter((item: any) => item.type === "function_call") : [];
      if (!calls.length) break;
      const toolOutputs = await Promise.all(calls.map(async (call: any) => {
        usedTools.add(String(call.name || ""));
        let args: Record<string, any> = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch { return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ erro: "Argumentos inválidos para a ferramenta." }) }; }
        try { return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(await executeTool(String(call.name || ""), args, session, toolCache)) }; } catch (error) { return { type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ erro: error instanceof Error ? error.message : "Falha ao consultar a ferramenta." }) }; }
      }));
      input.push(...(result.output || []), ...toolOutputs);
      result = await askOpenAI(input, session, responseSchema, allowWebSearch);
    }
    await logQuery(session, [...usedTools]);
    return json({ output: outputText(result) || "Não foi possível gerar uma resposta.", tools_used: [...usedTools] }, 200, origin);
  } catch (error) {
    console.error("Maestro AI error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao consultar o ChatGPT." }, 500, origin);
  }
});
