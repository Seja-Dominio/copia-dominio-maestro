import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const origins = new Set([
  "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:4174", "http://localhost:4174",
  "http://127.0.0.1:4175", "http://localhost:4175", "http://127.0.0.1:5173", "http://localhost:5173",
  "https://dominiomaestro.com.br",
]);

type Session = { sub: string; exp: number; access_level: string; permissions: Record<string, unknown> };
type Row = { entity: string; record_id: string; payload: Record<string, any>; source_updated_at: string | null };

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
  { type: "function", name: "buscar_clientes", description: "Busca clientes e retorna somente dados de carteira permitidos ao colaborador.", parameters: { type: "object", properties: { busca: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "buscar_projetos", description: "Busca projetos por nome, cliente ou status, respeitando o escopo do colaborador.", parameters: { type: "object", properties: { busca: { type: "string" }, status: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "buscar_jobs", description: "Busca jobs por título, cliente, status ou período. Inclui briefing e legenda apenas para jobs visíveis ao colaborador.", parameters: { type: "object", properties: { busca: { type: "string" }, status: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "buscar_tarefas", description: "Busca subtarefas abertas, atrasadas ou concluídas. Colaboradores comuns veem somente as próprias tarefas.", parameters: { type: "object", properties: { busca: { type: "string" }, somente_abertas: { type: "boolean" }, somente_atrasadas: { type: "boolean" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "consultar_dashboard", description: "Calcula indicadores operacionais atuais do Dashboard e informa a origem e a atualização dos dados.", parameters: { type: "object", properties: { periodo: { type: "string", enum: ["hoje", "7_dias", "30_dias"] } }, additionalProperties: false } },
  { type: "function", name: "consultar_relatorios", description: "Consulta indicadores operacionais dos relatórios. Valores financeiros só são retornados quando a permissão Financeiro está habilitada.", parameters: { type: "object", properties: { periodo: { type: "string" }, tipo: { type: "string" } }, additionalProperties: false } },
  { type: "function", name: "consultar_financeiro", description: "Consulta lançamentos, receitas, despesas e previsões financeiras. Só pode ser usada por Gestor ou Master com Financeiro habilitado.", parameters: { type: "object", properties: { busca: { type: "string" }, tipo: { type: "string" }, status: { type: "string" }, de: { type: "string" }, ate: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "consultar_comercial", description: "Consulta propostas e contratos comerciais. Só pode ser usada quando a aba Propostas/Comercial está habilitada para o colaborador.", parameters: { type: "object", properties: { busca: { type: "string" }, status: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { type: "function", name: "consultar_configuracoes", description: "Consulta configurações operacionais não secretas e colaboradores. Exclusiva para Master com a área de configurações habilitada.", parameters: { type: "object", properties: { chave: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "consultar_contas_ads", description: "Consulta contas e status do Ads Brain sem expor tokens ou credenciais da Meta.", parameters: { type: "object", properties: { busca: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { type: "function", name: "consultar_metricas_campanhas", description: "Consulta métricas e campanhas sincronizadas do Ads Brain sem expor credenciais.", parameters: { type: "object", properties: { conta_id: { type: "string" }, busca: { type: "string" }, limite: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false } },
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
  const { data } = await db.from("maestro_collaborators").select("id,is_active,profile").eq("id", payload.sub).maybeSingle();
  if (!data?.is_active) return null;
  const profile = (data.profile || {}) as Record<string, unknown>;
  return { sub: String(data.id), exp: Number(payload.exp), access_level: normalizeLevel(profile.access_level || payload.access_level), permissions: (profile.permissions || {}) as Record<string, unknown> };
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
  if (tab === "Financial" && !["master", "gestor"].includes(level)) return false;
  if (tab === "Financial") return configuredTabs ? tabs.Financial === true : level === "master";
  if (tab === "Settings") return level === "master" && (configuredTabs ? tabs.Settings === true : true);
  if (tabs[tab] !== undefined) return tabs[tab] === true;
  return (ACCESSIBLE_TAB_DEFAULTS[level] || ACCESSIBLE_TAB_DEFAULTS.collaborator).includes(tab);
}

function canUse(session: Session, module: "financial" | "commercial" | "settings" | "reports" | "ads") {
  if (module === "financial") return hasTab(session, "Financial");
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

async function listRows(entity: string) {
  const { data, error } = await db.from("legacy_records").select("entity,record_id,payload,source_updated_at").eq("entity", entity).range(0, 9999);
  if (error) throw error;
  return (data || []) as Row[];
}

function textMatches(value: unknown, search: string) {
  return !search || String(value || "").toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"));
}

function dateMatches(value: unknown, from: string, until: string) {
  const date = String(value || "").slice(0, 10);
  return (!from || date >= from) && (!until || date <= until);
}

async function visibleOperational(session: Session) {
  const [jobs, subtasks, projects, clients] = await Promise.all([listRows("Job"), listRows("Subtask"), listRows("Project"), listRows("Client")]);
  const level = normalizeLevel(session.access_level);
  if (["master", "gestor"].includes(level)) return { jobs, subtasks, projects, clients };
  const ownSubtaskJobIds = new Set(subtasks.filter(row => String(row.payload.responsible_id || "") === session.sub).map(row => String(row.payload.job_id || "")));
  const visibleJobs = jobs.filter(row => String(row.payload.responsible_id || "") === session.sub || ownSubtaskJobIds.has(String(row.record_id)));
  const visibleJobIds = new Set(visibleJobs.map(row => row.record_id));
  const visibleProjectIds = new Set(visibleJobs.map(row => String(row.payload.project_id || "")).filter(Boolean));
  const visibleClientIds = new Set(visibleJobs.map(row => String(row.payload.client_id || "")).filter(Boolean));
  return { jobs: visibleJobs, subtasks: subtasks.filter(row => String(row.payload.responsible_id || "") === session.sub || visibleJobIds.has(String(row.payload.job_id || ""))), projects: projects.filter(row => visibleProjectIds.has(row.record_id)), clients: clients.filter(row => visibleClientIds.has(row.record_id)) };
}

function sourceMeta(extra: Record<string, unknown> = {}) {
  return { fonte: "Maestro", gerado_em: new Date().toISOString(), ...extra };
}

function countJobs(jobs: Row[], from = "", until = "") {
  return jobs.filter(row => dateMatches(row.payload.post_date || row.payload.created_date, from, until));
}

function isCompleted(payload: Record<string, any>) {
  return payload.is_completed === true || ["completed", "concluido", "concluída", "concluido"].includes(String(payload.status || "").toLowerCase());
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
  const operationalNames = new Set(["buscar_clientes", "buscar_projetos", "buscar_jobs", "buscar_tarefas", "consultar_dashboard", "consultar_relatorios", "comparar_periodos", "gerar_resumo_diario", "gerar_feedback_cliente"]);
  const operational = operationalNames.has(name) ? await (cache.operational ||= visibleOperational(session)) : { jobs: [], subtasks: [], projects: [], clients: [] };
  if (name === "buscar_clientes") {
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
  if (name === "buscar_tarefas") {
    const today = new Date().toISOString().slice(0, 10);
    const rows = operational.subtasks.filter(row => textMatches(`${row.payload.title} ${row.payload.responsible_name}`, search))
      .filter(row => !args.somente_abertas || !isCompleted(row.payload))
      .filter(row => !args.somente_atrasadas || (String(row.payload.deadline || "") < today && !isCompleted(row.payload))).slice(0, limit);
    return { ...sourceMeta(), total: rows.length, tarefas: rows.map(row => projectRecord("Subtask", row.payload)) };
  }
  if (name === "consultar_dashboard") {
    const period = String(args.periodo || "hoje");
    const today = new Date().toISOString().slice(0, 10);
    const from = period === "30_dias" ? new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10) : period === "7_dias" ? new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10) : today;
    const jobs = countJobs(operational.jobs, from, today);
    const tasksOpen = operational.subtasks.filter(row => !isCompleted(row.payload));
    return { ...sourceMeta({ periodo: period }), indicadores: { clientes_visiveis: operational.clients.length, projetos_visiveis: operational.projects.length, jobs_no_periodo: jobs.length, tarefas_abertas: tasksOpen.length, jobs_atrasados: operational.jobs.filter(row => String(row.payload.post_date || "") < today && !isCompleted(row.payload)).length, tarefas_atrasadas: tasksOpen.filter(row => String(row.payload.deadline || "") < today).length } };
  }
  if (name === "consultar_relatorios") {
    if (!canUse(session, "reports")) return { acesso_negado: true, motivo: "A aba Relatórios não está habilitada para este usuário." };
    const today = new Date().toISOString().slice(0, 10);
    const openTasks = operational.subtasks.filter(row => !isCompleted(row.payload));
    const report: Record<string, unknown> = { ...sourceMeta({ periodo: String(args.periodo || "atual") }), producao: { total_jobs: operational.jobs.length, jobs_concluidos: operational.jobs.filter(row => isCompleted(row.payload)).length, tarefas_abertas: openTasks.length, tarefas_atrasadas: openTasks.filter(row => String(row.payload.deadline || "") < today).length } };
    if (canUse(session, "financial")) report.financeiro = await financialSummary();
    return report;
  }
  if (name === "consultar_financeiro") {
    if (!canUse(session, "financial")) return { acesso_negado: true, motivo: "Financeiro exige perfil Gestor ou Master e a aba habilitada no cadastro do colaborador." };
    const rows = (await listRows("FinancialEntry")).filter(row => textMatches(`${row.payload.description} ${row.payload.client_name} ${row.payload.category}`, search) && textMatches(row.payload.type, String(args.tipo || "")) && textMatches(row.payload.status, String(args.status || "")) && dateMatches(row.payload.due_date || row.payload.competence_date, String(args.de || ""), String(args.ate || ""))).slice(0, limit);
    return { ...sourceMeta({ modulo: "Financeiro" }), total: rows.length, lancamentos: rows.map(row => projectRecord("FinancialEntry", row.payload)) };
  }
  if (name === "consultar_comercial") {
    if (!canUse(session, "commercial")) return { acesso_negado: true, motivo: "A área Comercial exige a aba Propostas habilitada para este usuário." };
    const [proposals, contracts] = await Promise.all([listRows("Proposal"), listRows("FeeContract")]);
    const matches = (row: Row) => textMatches(`${row.payload.title} ${row.payload.name} ${row.payload.client_name}`, search) && textMatches(row.payload.status, String(args.status || ""));
    return { ...sourceMeta({ modulo: "Comercial" }), propostas: proposals.filter(matches).slice(0, limit).map(row => projectRecord("Proposal", row.payload)), contratos: contracts.filter(matches).slice(0, limit).map(row => projectRecord("FeeContract", row.payload)) };
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
    if (name === "consultar_contas_ads") return { ...sourceMeta({ modulo: "Ads Brain" }), total: accounts.length, contas: accounts.map(account => ({ id: account.id, cliente: account.client_name, conta: account.display_name, rede: account.network, moeda: account.currency, status: account.account_status, saldo: account.balance, limite_minimo: account.minimum_balance, limite_gasto: account.spending_limit, gasto_total: account.amount_spent, ultima_sincronizacao: account.last_synced_at })) };
    return { ...sourceMeta({ modulo: "Ads Brain" }), total: accounts.length, contas: accounts.map(account => ({ id: account.id, cliente: account.client_name, ultima_sincronizacao: account.last_synced_at, metricas: account.metrics_data || {}, campanhas: (Array.isArray(account.campaigns_data) ? account.campaigns_data : []).filter(campaign => textMatches(campaign?.name, search)).slice(0, 50).map(campaign => ({ id: campaign?.id, nome: campaign?.name, status: campaign?.effective_status || campaign?.status, investimento: campaign?.insights?.data?.[0]?.spend, impressoes: campaign?.insights?.data?.[0]?.impressions, cliques: campaign?.insights?.data?.[0]?.clicks, ctr: campaign?.insights?.data?.[0]?.ctr, cpc: campaign?.insights?.data?.[0]?.cpc, cpm: campaign?.insights?.data?.[0]?.cpm })) })) };
  }
  if (name === "comparar_periodos") {
    const first = countJobs(operational.jobs, String(args.periodo_a_de || ""), String(args.periodo_a_ate || ""));
    const second = countJobs(operational.jobs, String(args.periodo_b_de || ""), String(args.periodo_b_ate || ""));
    return { ...sourceMeta({ periodo_a: `${args.periodo_a_de || ""} a ${args.periodo_a_ate || ""}`, periodo_b: `${args.periodo_b_de || ""} a ${args.periodo_b_ate || ""}` }), comparativo: { periodo_a: { jobs: first.length, concluidos: first.filter(row => isCompleted(row.payload)).length }, periodo_b: { jobs: second.length, concluidos: second.filter(row => isCompleted(row.payload)).length } }, limitacao: "O histórico diário de métricas do Ads Brain ainda não está persistido; a comparação de mídia será habilitada quando essa série histórica for criada." };
  }
  if (name === "gerar_resumo_diario") {
    const dashboard = await executeTool("consultar_dashboard", { periodo: "hoje" }, session, cache);
    const today = new Date().toISOString().slice(0, 10);
    const overdue = operational.jobs.filter(row => String(row.payload.post_date || "") < today && !isCompleted(row.payload)).slice(0, 10);
    return { ...sourceMeta({ periodo: "hoje" }), dashboard, pendencias: overdue.map(row => projectRecord("Job", row.payload)) };
  }
  if (name === "gerar_feedback_cliente") {
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

async function askOpenAI(input: any[], session: Session) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("A integração com o ChatGPT ainda não foi configurada.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna",
      reasoning: { effort: Deno.env.get("OPENAI_REASONING_EFFORT") || "high" },
      text: { verbosity: Deno.env.get("OPENAI_TEXT_VERBOSITY") || "medium" },
      store: false,
      instructions: `Você é o ChatGPT integrado ao Maestro, uma plataforma brasileira para agências. Responda em português, com objetividade e contexto suficiente para uma decisão. Consulte ferramentas antes de afirmar dados do sistema. Use somente os dados retornados pelas ferramentas e informe fonte, período e última sincronização quando existirem. Separe fatos observados, interpretação e recomendação. Nunca invente números, nunca exponha credenciais e nunca diga que alterou algo. Ferramentas disponíveis são somente de leitura e preparação: qualquer criação, edição, envio ou exclusão deve ser apresentada como rascunho e exigir confirmação explícita do usuário em uma etapa posterior. O usuário possui nível ${session.access_level}; respeite os bloqueios de acesso retornados pelas ferramentas.`,
      tools: TOOL_DEFINITIONS,
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
    const input: any[] = [...history, { role: "user", content: `${body.message.trim()}\n\nContexto de navegação (não é fonte de dados): ${JSON.stringify(safeClientContext(body.context))}` }];
    let result = await askOpenAI(input, session);
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
      result = await askOpenAI(input, session);
    }
    await logQuery(session, [...usedTools]);
    return json({ output: outputText(result) || "Não foi possível gerar uma resposta.", tools_used: [...usedTools] }, 200, origin);
  } catch (error) {
    console.error("Maestro AI error:", error);
    return json({ error: error instanceof Error ? error.message : "Erro ao consultar o ChatGPT." }, 500, origin);
  }
});
