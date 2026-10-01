import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { accessLevelForOrganizationRole, organizationRoleForAccessLevel, selectOrganizationMembership } from "../_shared/maestro-tenant.mjs";
import { entityHasProductClassification, hasActiveOrganizationProduct, hasEntityProductAccess } from "../_shared/organization-products.mjs";
import { getCutoverWritePlan } from "../_shared/cutover-write-contract.mjs";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const allowedOrigins = new Set(["http://127.0.0.1:4173", "http://localhost:4173", "https://dominiomaestro.com.br"]);
function corsHeaders(origin = "") {
  return {
  "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://dominiomaestro.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type Session = { sub: string; exp: number; access_level?: string; display_name?: string; organization_id?: string; scope?: "user" | "group"; group_id?: string };
type LegacyRow = {
  entity: string;
  record_id: string;
  payload: Record<string, unknown>;
  source_created_at: string | null;
  source_updated_at: string | null;
};

function encode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function verifySession(token: string): Promise<Session | null> {
  if (!sessionSecret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(decode(signature), (character) => character.charCodeAt(0)),
    new TextEncoder().encode(body),
  );
  if (!valid) return null;

  const session = JSON.parse(decode(body)) as Session;
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;

  if (session.scope === "group" && typeof session.group_id === "string" && session.group_id.endsWith("@g.us")) {
    if (!session.organization_id) return null;
    return {
      ...session,
      access_level: "collaborator",
    };
  }

  const { data: collaborator, error: collaboratorError } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active, profile")
    .eq("id", session.sub)
    .maybeSingle();
  if (collaboratorError || !collaborator?.is_active) return null;

  let membershipsQuery = supabase
    .from("organization_members")
    .select("organization_id, role, status, organizations!inner(status)")
    .eq("collaborator_id", session.sub)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(2);
  if (session.organization_id) membershipsQuery = membershipsQuery.eq("organization_id", session.organization_id);
  const { data: memberships, error: membershipError } = await membershipsQuery;
  if (membershipError) return null;
  const organizationChoice = selectOrganizationMembership(memberships, session.organization_id);
  if (!organizationChoice.ok) return null;
  const membership = organizationChoice.membership;
  return {
    ...session,
    organization_id: membership.organization_id,
    access_level: accessLevelForOrganizationRole(membership.organization_role),
  };
}

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function sanitizePayload(entity: string, payload: Record<string, unknown>) {
  const safe = { ...payload };
  if (entity === "Collaborator" || entity === "User") delete safe.password_hash;
  return safe;
}

const DASHBOARD_FIELDS: Record<string, string[]> = {
  Project: ["id", "name", "title", "status", "client_id", "client_name", "created_date", "updated_date"],
  Job: ["id", "number", "title", "content_type", "status", "post_date", "project_id", "project_name", "client_id", "client_name", "responsible_id", "responsible_name", "stage_title", "stage_responsible_name", "created_date", "updated_date", "completed_at"],
  Subtask: ["id", "job_id", "title", "status", "is_completed", "completed_at", "deadline", "order", "responsible_id", "responsible_name", "created_date", "updated_date"],
  Timesheet: ["id", "collaborator_id", "job_id", "job_title", "client_id", "client_name", "is_running", "started_at", "duration_minutes", "created_date", "updated_date"],
  Client: ["id", "name", "status", "tier", "nps_score", "created_date", "updated_date"],
  Collaborator: ["id", "name", "full_name", "email", "role", "access_level", "is_active", "color", "birthday", "birth_date", "last_seen_at", "last_seen_page"],
  AgendaEvent: ["id", "client_id", "date", "status", "title", "type", "created_date", "updated_date"],
  FinancialEntry: ["id", "type", "status", "amount", "due_date", "competence_date", "payment_date", "billing_date", "created_date", "updated_date"],
};

function compactDashboardPayload(entity: string, payload: Record<string, unknown>) {
  const fields = DASHBOARD_FIELDS[entity];
  if (!fields) return sanitizePayload(entity, payload);
  return Object.fromEntries(fields
    .filter((field) => payload[field] !== undefined)
    .map((field) => [field, payload[field]]));
}

const SAFE_PAYLOAD_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ListRowsOptions = {
  filters?: Record<string, unknown>;
  sort?: string;
  offset?: number;
  limit?: number;
};

type FilterOperator = {
  eq?: unknown;
  gt?: unknown;
  gte?: unknown;
  lt?: unknown;
  lte?: unknown;
  in?: unknown[];
  not_in?: unknown[];
  include_null?: boolean;
};

const RELATIONAL_CORE_ENTITIES = new Set(["Client", "Project", "Job", "Subtask", "FinancialEntry", "AgendaEvent", "Timesheet", "Notification"]);
const RELATIONAL_DOCUMENT_ENTITIES = new Set(["JobTemplate", "Proposal", "Note"]);
const RELATIONAL_FINANCIAL_ENTITIES = new Set(["BankAccount", "FinancialCategory", "CostCenter"]);
const RELATIONAL_INSIGHTS_ENTITIES = new Set(["NpsEntry", "NpsHistory"]);
const RELATIONAL_CXM_ENTITIES = new Set(["WhatsappContact", "WhatsappGroup", "WhatsappAutomation"]);
const RELATIONAL_COMMENT_ENTITIES = new Set(["Comment"]);
const RELATIONAL_WEBHOOK_ENTITIES = new Set(["DominusWebhookParsed"]);

function isRelationalEntity(entity: string) {
  return RELATIONAL_CORE_ENTITIES.has(entity)
    || RELATIONAL_DOCUMENT_ENTITIES.has(entity)
    || RELATIONAL_FINANCIAL_ENTITIES.has(entity)
    || RELATIONAL_INSIGHTS_ENTITIES.has(entity)
    || RELATIONAL_CXM_ENTITIES.has(entity)
    || RELATIONAL_COMMENT_ENTITIES.has(entity)
    || RELATIONAL_WEBHOOK_ENTITIES.has(entity);
}

function normalizePageValue(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(parsed)));
}

async function listRows(organizationId: string, entity: string, options: ListRowsOptions = {}) {
  const offset = normalizePageValue(options.offset, 0, 1_000_000);
  const limit = normalizePageValue(options.limit, 100, 10_000);
  const filters = options.filters || {};
  const sort = typeof options.sort === "string" ? options.sort : "";
  const descending = sort ? sort.startsWith("-") : true;
  const sortField = descending ? sort.slice(1) : sort;

  let query = supabase
    .from("legacy_records")
    .select("entity, record_id, payload, source_created_at, source_updated_at")
    .eq("entity", entity)
    .eq("organization_id", organizationId);

  // Filter inside Postgres so the Edge Function does not download the full
  // entity before applying a small UI limit.
  for (const [field, expected] of Object.entries(filters)) {
    if (!SAFE_PAYLOAD_FIELD.test(field)) continue;
    const isOperator = expected && typeof expected === "object" && !Array.isArray(expected);
    if (isOperator) {
      const operator = expected as FilterOperator;
      if (operator.eq !== undefined) query = query.eq(`payload->>${field}`, String(operator.eq));
      if (operator.gt !== undefined) query = query.gt(`payload->>${field}`, String(operator.gt));
      if (operator.gte !== undefined) query = query.gte(`payload->>${field}`, String(operator.gte));
      if (operator.lt !== undefined) query = query.lt(`payload->>${field}`, String(operator.lt));
      if (operator.lte !== undefined) query = query.lte(`payload->>${field}`, String(operator.lte));
      if (Array.isArray(operator.in)) query = query.in(`payload->>${field}`, operator.in.map(String));
      if (Array.isArray(operator.not_in)) query = query.not(`payload->>${field}`, "in", `(${operator.not_in.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`);
    } else if (expected === null) {
      query = query.is(`payload->>${field}`, null);
    } else if (Array.isArray(expected)) {
      query = query.filter(`payload->${field}`, "eq", JSON.stringify(expected));
    } else {
      query = query.eq(`payload->>${field}`, String(expected));
    }
  }

  if (sortField && SAFE_PAYLOAD_FIELD.test(sortField)) {
    query = query.order(`payload->>${sortField}`, {
      ascending: !descending,
      nullsFirst: false,
    });
  } else {
    query = query.order("source_updated_at", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query
    .order("record_id", { ascending: true })
    .range(offset, Math.max(offset, offset + limit - 1));
  if (error) throw error;
  return (data || []) as LegacyRow[];
}

async function listRelationalCoreRows(entity: string, organizationId: string, options: ListRowsOptions = {}) {
  if (!isRelationalEntity(entity)) return null;
  if (!organizationId) throw new Error("Sessão sem organização para leitura relacional");

  const tableByEntity: Record<string, string> = {
    Client: "maestro_clients",
    Project: "maestro_projects",
    Job: "maestro_jobs",
    Subtask: "maestro_job_tasks",
    FinancialEntry: "maestro_financial_entries",
    AgendaEvent: "maestro_agenda_events",
    Timesheet: "maestro_timesheets",
    Notification: "maestro_notifications",
    JobTemplate: "maestro_job_templates",
    Proposal: "maestro_proposals",
    Note: "maestro_notes",
    BankAccount: "maestro_bank_accounts",
    FinancialCategory: "maestro_financial_categories",
    CostCenter: "maestro_cost_centers",
    NpsEntry: "maestro_nps_entries",
    NpsHistory: "maestro_nps_history",
    WhatsappContact: "maestro_whatsapp_contacts",
    WhatsappGroup: "maestro_whatsapp_groups",
    WhatsappAutomation: "maestro_whatsapp_automations",
    Comment: "maestro_job_comments",
    DominusWebhookParsed: "maestro_webhook_parsed_messages",
  };
  const payloadColumnByEntity: Record<string, string> = {
    Client: "source_payload",
    Project: "source_payload",
    Job: "source_payload",
    Subtask: "source_payload",
    FinancialEntry: "source_payload",
    AgendaEvent: "source_payload",
    Timesheet: "source_payload",
    Notification: "source_payload",
    JobTemplate: "template_payload",
    Proposal: "proposal_payload",
    Note: "note_payload",
    BankAccount: "payload",
    FinancialCategory: "payload",
    CostCenter: "payload",
    NpsEntry: "payload",
    NpsHistory: "payload",
    WhatsappContact: "payload",
    WhatsappGroup: "payload",
    WhatsappAutomation: "automation_payload",
    Comment: "payload",
    DominusWebhookParsed: "payload",
  };
  const payloadColumn = payloadColumnByEntity[entity];
  if (!payloadColumn) return null;
  const offset = normalizePageValue(options.offset, 0, 1_000_000);
  const limit = normalizePageValue(options.limit, 100, 10_000);
  const filters = options.filters || {};
  const sort = typeof options.sort === "string" ? options.sort : "";
  const descending = sort ? sort.startsWith("-") : true;
  const sortField = descending ? sort.slice(1) : sort;
  const fieldsByEntity: Record<string, Record<string, string>> = {
    WhatsappAutomation: { kind: "kind", name: "name", active: "active", group_id: "group_id", schedule_time: "schedule_time", frequency: "frequency" },
    Comment: { job_id: "job_legacy_record_id", created_by_id: "author_legacy_record_id", content: "content" },
    DominusWebhookParsed: { message_id: "message_id", group_id: "group_id", text: "text_content", from_me: "from_me", media_kind: "media_kind", media_failed: "media_failed" },
    WhatsappContact: { external_id: "external_id", instance: "instance", name: "name", phone: "phone" },
    WhatsappGroup: { external_id: "external_id", instance: "instance", name: "name" },
    NpsEntry: { client_id: "client_legacy_record_id", month: "month", monthly_score: "monthly_score", recorded_by: "recorded_by" },
    NpsHistory: { client_id: "client_legacy_record_id", job_id: "job_legacy_record_id", event_type: "event_type", score_before: "score_before", score_after: "score_after" },
    BankAccount: { name: "name", bank_name: "bank_name", account_type: "account_type", is_active: "is_active", balance: "balance" },
    FinancialCategory: { name: "name", type: "category_type", category_type: "category_type", is_active: "is_active", order: "display_order" },
    CostCenter: { name: "name", description: "description", is_active: "is_active" },
    JobTemplate: { name: "name", content_type: "content_type", team: "team" },
    Proposal: { title: "title", client_id: "client_legacy_record_id", status: "status" },
    Note: { title: "title" },
    Client: { name: "name", company_name: "company_name", status: "status", email: "email", phone: "phone", client_id: "legacy_record_id" },
    Project: { name: "name", status: "status", client_id: "client_legacy_record_id", reference_month: "reference_month" },
    Job: { title: "title", status: "status", content_type: "content_type", project_id: "project_legacy_record_id", client_id: "client_legacy_record_id", post_date: "post_date" },
    Subtask: { title: "title", status: "status", job_id: "legacy_job_record_id", responsible_id: "responsible_id", deadline: "deadline", is_completed: "is_completed", order: "task_order" },
    FinancialEntry: { type: "type", title: "title", amount: "amount", status: "status", category: "category", client_id: "client_legacy_record_id", due_date: "due_date", competence_date: "competence_date", billing_date: "billing_date", payment_date: "payment_date", bank_account_id: "bank_account_legacy_record_id" },
    AgendaEvent: { title: "title", date: "event_date", status: "status", activity_type: "activity_type", client_id: "client_legacy_record_id", collaborator_id: "collaborator_id" },
    Timesheet: { job_id: "legacy_job_record_id", client_id: "client_legacy_record_id", project_id: "project_legacy_record_id", collaborator_id: "collaborator_id", status: "status", is_running: "is_running", started_at: "started_at", ended_at: "ended_at" },
    Notification: { user_id: "user_id", type: "type", title: "title", is_read: "is_read", entity_type: "entity_type", entity_id: "entity_id" },
  };
  const fields = fieldsByEntity[entity] || {};
  if (sortField && !["created_date", "updated_date"].includes(sortField) && !fields[sortField]) return null;
  let query = supabase.from(tableByEntity[entity])
    .select(`legacy_record_id, ${payloadColumn}, created_at, updated_at`)
    .eq("organization_id", organizationId);

  for (const [field, expected] of Object.entries(filters)) {
    if (!SAFE_PAYLOAD_FIELD.test(field)) continue;
    const column = fields[field];
    if (!column) return null;
    const isOperator = Boolean(expected && typeof expected === "object" && !Array.isArray(expected));
    if (isOperator) {
      const operator = expected as FilterOperator;
      if (operator.include_null === true) return null;
      if (operator.eq !== undefined) query = query.eq(column, String(operator.eq));
      if (operator.gt !== undefined) query = query.gt(column, String(operator.gt));
      if (operator.in?.length) query = query.in(column, operator.in.map(String));
      if (operator.not_in?.length) query = query.not(column, "in", `(${operator.not_in.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`);
      if (operator.gte !== undefined) query = query.gte(column, String(operator.gte));
      if (operator.lt !== undefined) query = query.lt(column, String(operator.lt));
      if (operator.lte !== undefined) query = query.lte(column, String(operator.lte));
    } else if (expected === null) {
      query = query.is(column, null);
    } else if (Array.isArray(expected)) {
      return null;
    } else {
      query = query.eq(column, String(expected));
    }
  }

  const orderColumn = sortField === "created_date" ? "created_at"
    : sortField === "updated_date" ? "updated_at"
      : fields[sortField] || "updated_at";
  const { data, error } = await query
    .order(orderColumn, { ascending: !descending, nullsFirst: false })
    .order("legacy_record_id", { ascending: true })
    .range(offset, Math.max(offset, offset + limit - 1));
  if (error) throw error;
  return (data || []).map((row: Record<string, unknown>) => ({
    entity,
    record_id: String(row.legacy_record_id),
    payload: (row[payloadColumn] || {}) as Record<string, unknown>,
    source_created_at: row.created_at as string | null,
    source_updated_at: row.updated_at as string | null,
  })) as LegacyRow[];
}

function collaboratorAccessLevel(collaborator: Record<string, unknown>) {
  return String(collaborator.access_level || (collaborator.profile as Record<string, unknown> | undefined)?.access_level || "collaborator").toLowerCase();
}

function dashboardCollaborator(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name || row.full_name || "",
    email: row.email || "",
    is_active: row.is_active !== false,
    access_level: collaboratorAccessLevel(row),
    avatar_url: row.avatar_url || row.photo_url || null,
    birth_date: row.birth_date || row.birthday || null,
  };
}

async function dashboardData(session: Session) {
  const requests = [
    ["projects", "Project", "-created_date", 50],
    ["jobs", "Job", "-post_date", 5000],
    ["entries", "FinancialEntry", "-created_date", 150],
    ["collaborators", "Collaborator", "name", 100],
    ["timesheets", "Timesheet", "-created_date", 1000],
    ["clients", "Client", "-nps_score", 100],
    ["agendaEvents", "AgendaEvent", "-date", 100],
    ["subtasks", "Subtask", "-created_date", 10000],
  ] as const;

  const values = await Promise.all(requests.map(async ([key, entity, sort, limit]) => {
    const rows = await listRows(String(session.organization_id || ""), entity, { sort, limit });
    return [key, rows.slice(0, limit).map((row) => compactDashboardPayload(entity, row.payload))] as const;
  }));

  const allData = Object.fromEntries(values) as Record<string, any[]>;
  const role = String(session?.access_level || "collaborator").toLowerCase();
  const canViewTeam = ["master", "gestor"].includes(role);
  const canViewFinancial = role === "master";
  const collaborators = (allData.collaborators || []).map(dashboardCollaborator);

  if (canViewTeam) {
    return {
      ...allData,
      collaborators,
      entries: canViewFinancial ? allData.entries || [] : [],
    };
  }

  const myId = String(session?.sub || "");
  const mySubtasks = (allData.subtasks || []).filter((subtask) => String(subtask.responsible_id || "") === myId);
  const myJobIds = new Set(mySubtasks.map((subtask) => String(subtask.job_id || "")).filter(Boolean));
  const jobs = (allData.jobs || []).filter((job) => myJobIds.has(String(job.id || "")));
  const projectIds = new Set(jobs.map((job) => String(job.project_id || "")).filter(Boolean));
  const projects = (allData.projects || []).filter((project) => projectIds.has(String(project.id || "")));
  const clientIds = new Set([
    ...jobs.map((job) => String(job.client_id || "")).filter(Boolean),
    ...projects.map((project) => String(project.client_id || "")).filter(Boolean),
  ]);
  const visibleCollaborators = collaborators.filter((collaborator) => !["gestor", "master"].includes(collaborator.access_level));

  return {
    projects,
    jobs,
    entries: [],
    collaborators: visibleCollaborators,
    timesheets: (allData.timesheets || []).filter((timesheet) => visibleCollaborators.some((collaborator) => collaborator.id === timesheet.collaborator_id)),
    clients: (allData.clients || []).filter((client) => clientIds.has(String(client.id || ""))),
    agendaEvents: (allData.agendaEvents || []).filter((event) => clientIds.has(String(event.client_id || ""))),
    subtasks: mySubtasks,
  };
}

async function handleOperation(body: Record<string, unknown>, origin = "", session?: Session) {
  if (!session?.organization_id) return json({ error: "Sessão sem organização ativa" }, 403, origin);
  const operation = String(body.operation || "list");
  if (operation === "dashboard") {
    const { data: products, error: productsError } = await supabase.from("organization_products")
      .select("product_key,status,expires_at")
      .eq("organization_id", session.organization_id)
      .eq("product_key", "maestro");
    if (productsError) throw productsError;
    if (!hasActiveOrganizationProduct(products, "maestro")) {
      return json({ error: "O produto Maestro não está habilitado para esta organização" }, 403, origin);
    }
    return json({ data: await dashboardData(session) }, 200, origin);
  }

  const entity = String(body.entity || "");
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(entity)) return json({ error: "Entidade inválida" }, 400, origin);
  const isGroupSession = session?.scope === "group";
  if (isGroupSession && !["Job", "Subtask", "AgendaEvent"].includes(entity)) {
    return json({ error: "A sessão do grupo só pode consultar dados operacionais" }, 403, origin);
  }

  const { data: registryEntry, error: registryError } = await supabase
    .from("legacy_cutover_registry")
    .select("module_key,status,write_mode,legacy_write_allowed")
    .eq("entity", entity)
    .maybeSingle();
  if (registryError) throw registryError;
  if (!entityHasProductClassification(entity, registryEntry?.module_key)) {
    return json({ error: "Entidade sem classificação de produto" }, 403, origin);
  }
  const { data: products, error: productsError } = await supabase
    .from("organization_products")
    .select("product_key,status,expires_at")
    .eq("organization_id", session.organization_id);
  if (productsError) throw productsError;
  if (!hasEntityProductAccess(entity, registryEntry?.module_key, products || [])) {
    return json({ error: "Produto não habilitado para esta organização" }, 403, origin);
  }
  const cutoverWritePlan = getCutoverWritePlan(registryEntry, entity, operation);
  if (cutoverWritePlan.mode === "unsupported") {
    return json({ error: "Esta operação ainda não tem um gravador relacional seguro." }, 409, origin);
  }

  const isWrite = ["create", "update", "bulkCreate", "delete", "transferSubtasks"].includes(operation);
  const accessLevel = String(body.__access_level || "").toLowerCase();
  const canCreateMiniTask = operation === "create" && entity === "MiniTask";
  const updateKeys = body.data && typeof body.data === "object" && !Array.isArray(body.data)
    ? Object.keys(body.data as Record<string, unknown>)
    : [];
  const canMarkOwnNotificationRead = operation === "update"
    && entity === "Notification"
    && session?.scope !== "group"
    && Boolean(session?.sub)
    && updateKeys.length === 1
    && updateKeys[0] === "is_read"
    && typeof (body.data as Record<string, unknown>)?.is_read === "boolean";
  const canUpdateJobStatus = operation === "update"
    && entity === "Job"
    && accessLevel === "collaborator"
    && updateKeys.length === 1
    && updateKeys[0] === "status"
    && typeof (body.data as Record<string, unknown>)?.status === "string"
    && String((body.data as Record<string, unknown>).status).trim().length > 0
    && String((body.data as Record<string, unknown>).status).trim().toLowerCase() !== "cancelled";
  const canWriteJob = ["create", "update"].includes(operation)
    && entity === "Job"
    && ["collaborator", "gestor", "master"].includes(accessLevel);
  const canWriteAgendaEvent = ["create", "update"].includes(operation)
    && entity === "AgendaEvent"
    && ["collaborator", "gestor", "master"].includes(accessLevel);
  // Cada usuário autenticado precisa conseguir iniciar e encerrar o próprio
  // timer ao abrir um job. A validação de propriedade acontece no bloco de
  // escrita, depois que o registro atual é carregado.
  const canWriteTimesheet = ["create", "update"].includes(operation)
    && entity === "Timesheet"
    && Boolean(session?.sub);
  const canDeleteAgendaEvent = operation === "delete"
    && entity === "AgendaEvent"
    && ["gestor", "master"].includes(accessLevel);
  const canDeleteJob = operation === "delete"
    && entity === "Job"
    && ["gestor", "master"].includes(accessLevel);
  const canCreateDeleteLog = operation === "create"
    && entity === "DeleteLog"
    && ["gestor", "master"].includes(accessLevel);
  const canManageCompetitor = ["create", "update", "delete"].includes(operation)
    && entity === "ClientCompetitor"
    && ["gestor", "master"].includes(accessLevel);
  const gestorWritableEntities = ["Client", "Project", "Job", "Subtask", "AgendaEvent", "JobTemplate", "Squad"];
  if (isWrite && !canMarkOwnNotificationRead && !canCreateMiniTask && !canUpdateJobStatus && !canWriteJob && !canWriteAgendaEvent && !canWriteTimesheet && !canDeleteJob && !canCreateDeleteLog && !canManageCompetitor && accessLevel === "gestor" && !gestorWritableEntities.includes(entity)) {
    return json({ error: "O Gestor não pode alterar este tipo de dado" }, 403, origin);
  }
  if (isWrite && !canMarkOwnNotificationRead && !canCreateMiniTask && !canUpdateJobStatus && !canWriteJob && !canWriteAgendaEvent && !canWriteTimesheet && !canDeleteAgendaEvent && !canDeleteJob && !canCreateDeleteLog && !canManageCompetitor && !["master", "gestor"].includes(accessLevel)) {
    return json({ error: "Apenas gestores e masters podem alterar dados" }, 403, origin);
  }
  if (["delete", "transferSubtasks"].includes(operation) && !canDeleteAgendaEvent && !canDeleteJob && !canManageCompetitor && accessLevel !== "master") {
    return json({ error: "Apenas o Master pode excluir ou transferir tarefas" }, 403, origin);
  }
  if (["list", "filter"].includes(operation)) {
    const limit = normalizePageValue(body.limit, 100, 10_000);
    const offset = normalizePageValue(body.offset, 0, 1_000_000);
    const readOptions = {
      filters: operation === "filter" ? (body.filters || {}) as Record<string, unknown> : {},
      sort: typeof body.sort === "string" ? body.sort : undefined,
      offset,
      limit,
    };
    const requestedRelational = body.read_source === "relational" && isRelationalEntity(entity);
    let rows = requestedRelational
      ? await listRelationalCoreRows(entity, session.organization_id, readOptions)
      : null;
    const actualReadSource = rows ? "relational" : "legacy";
    if (!rows) rows = await listRows(session.organization_id, entity, readOptions);
    return json({
      data: rows.slice(0, Math.max(0, limit)).map((row) => sanitizePayload(entity, row.payload)),
      ...(requestedRelational ? { read_source: actualReadSource } : {}),
    }, 200, origin);
  }

  if (operation === "transferSubtasks") {
    if (entity !== "Subtask") return json({ error: "A transferência só pode ser feita para subtasks" }, 400, origin);
    const sourceUserId = String(body.sourceUserId || "");
    const targetUserId = String(body.targetUserId || "");
    if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
      return json({ error: "Selecione usuários de origem e destino diferentes" }, 400, origin);
    }
    const { data, error } = await supabase.rpc("maestro_transfer_subtasks", {
      p_organization_id: session.organization_id,
      p_source_collaborator_id: sourceUserId,
      p_target_collaborator_id: targetUserId,
      p_actor_id: session.sub,
      p_actor_name: String(session.display_name || ""),
    });
    if (error) throw error;
    return json({ data }, 200, origin);
  }

  if (operation === "create" || operation === "update") {
    const payload = { ...((body.data || {}) as Record<string, unknown>) };
    if (entity === "Timesheet" && !["master", "gestor"].includes(accessLevel)) {
      if (operation === "create") {
        // Colaboradores só podem abrir o próprio apontamento; gestores e
        // masters mantêm a capacidade de registrar horas para terceiros.
        payload.collaborator_id = session?.sub;
      }
    }
    if (operation === "create" && entity === "MiniTask") {
      const collaboratorId = String(payload.collaborator_id || "");
      if (!collaboratorId) return json({ error: "A tarefa precisa de um responsável" }, 400, origin);

      const { data: recipient } = await supabase
        .from("legacy_records")
        .select("record_id, payload")
        .eq("entity", "Collaborator")
        .eq("record_id", collaboratorId)
        .eq("organization_id", session.organization_id)
        .maybeSingle();
      if (!recipient || recipient.payload?.is_active === false) {
        return json({ error: "O responsável selecionado não está ativo" }, 400, origin);
      }

      // A criação de MiniTask é permitida a todos os colaboradores, mas a
      // autoria e o nível de acesso nunca podem ser forjados no cliente.
      if (String(payload.sender_id || "")) {
        payload.sender_id = session?.sub;
        payload.sender_access_level = accessLevel;
      }
    }
    const recordId = operation === "update"
      ? String(body.id || "")
      : String(payload.id || crypto.randomUUID().replaceAll("-", ""));
    if (!recordId) return json({ error: "ID inválido" }, 400, origin);

    delete payload.organization_id;
    let nextPayload = { ...payload, id: recordId };
    let currentPayload: Record<string, unknown> | null = null;
    if (operation === "update") {
      const relationalTableByEntity: Record<string, string> = {
        Project: "maestro_projects",
        Job: "maestro_jobs",
        Subtask: "maestro_job_tasks",
        FinancialEntry: "maestro_financial_entries",
      };
      const relationalTable = relationalTableByEntity[entity];
      if (cutoverWritePlan.mode === "relational" && !relationalTable) {
        return json({ error: "Esta entidade não tem leitura relacional para edição." }, 409, origin);
      }
      const currentQuery = cutoverWritePlan.mode === "relational"
        ? await supabase.from(relationalTable as string)
          .select("source_payload")
          .eq("organization_id", session.organization_id)
          .eq("legacy_record_id", recordId)
          .maybeSingle()
        : await supabase.from("legacy_records")
          .select("payload")
          .eq("entity", entity)
          .eq("record_id", recordId)
          .eq("organization_id", session.organization_id)
          .maybeSingle();
      const { data: current, error: currentError } = currentQuery;
      if (currentError) throw currentError;
      if (!current) return json({ error: "Registro não encontrado nesta organização" }, 404, origin);
      currentPayload = (cutoverWritePlan.mode === "relational" ? current.source_payload : current.payload) || {};
      if (canMarkOwnNotificationRead) {
        const ownerId = currentPayload?.user_id || currentPayload?.collaborator_id;
        if (String(ownerId || "") !== String(session?.sub || "")) {
          return json({ error: "Você só pode marcar as próprias notificações como lidas" }, 403, origin);
        }
        // Keep this exception intentionally narrow: the authenticated user
        // may change only is_read on a notification that belongs to them.
        nextPayload = { ...currentPayload, is_read: payload.is_read, id: recordId };
      }
      if (
        entity === "Timesheet"
        && !["master", "gestor"].includes(accessLevel)
        && String(currentPayload?.collaborator_id || "") !== String(session?.sub || "")
      ) {
        return json({ error: "Você só pode atualizar o próprio Timesheet" }, 403, origin);
      }
      if (entity === "Timesheet" && !["master", "gestor"].includes(accessLevel)) {
        payload.collaborator_id = currentPayload?.collaborator_id;
        payload.collaborator_name = currentPayload?.collaborator_name;
      }
      if (!canMarkOwnNotificationRead) {
        nextPayload = { ...currentPayload, ...payload, id: recordId };
      }
    }

    if (cutoverWritePlan.mode === "relational") {
      let data: unknown;
      if (cutoverWritePlan.writer === "project-rpc") {
        const result = await supabase.rpc("maestro_upsert_project_scoped", {
          p_organization_id: session.organization_id,
          p_action: operation,
          p_record_id: recordId,
          p_payload: nextPayload,
        });
        if (result.error) throw result.error;
        data = result.data;
      } else if (cutoverWritePlan.writer === "core-history-rpc") {
        const result = await supabase.rpc("maestro_write_frozen_core_with_history", {
          p_organization_id: session.organization_id,
          p_entity: entity,
          p_action: operation,
          p_record_id: recordId,
          p_payload: nextPayload,
          p_actor_id: session.sub,
          p_actor_name: String(session.display_name || ""),
        });
        if (result.error) throw result.error;
        data = result.data;
      } else if (cutoverWritePlan.writer === "financial-rpc") {
        const result = await supabase.rpc("maestro_upsert_financial_entries_scoped", {
          p_organization_id: session.organization_id,
          p_entries: [nextPayload],
        });
        if (result.error) throw result.error;
        data = Array.isArray(result.data) ? result.data[0] : nextPayload;
      } else {
        return json({ error: "O gravador relacional não está configurado para esta operação." }, 409, origin);
      }
      return json({ data: sanitizePayload(entity, (data || nextPayload) as Record<string, unknown>) }, 200, origin);
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("legacy_records").upsert({
      entity,
      record_id: recordId,
      organization_id: session.organization_id,
      payload: nextPayload,
      source_created_at: nextPayload.created_date || now,
      source_updated_at: now,
    }, { onConflict: "entity,record_id" });
    if (error) throw error;

    if (entity === "Collaborator") {
      const { data: currentAuth, error: currentAuthError } = await supabase
        .from("maestro_collaborators")
        .select("login, password_hash, profile")
        .eq("id", recordId)
        .maybeSingle();
      if (currentAuthError) throw currentAuthError;

      const profile = {
        ...(currentAuth?.profile || {}),
        ...sanitizePayload(entity, nextPayload),
        id: recordId,
      };
      const { error: authError } = await supabase.from("maestro_collaborators").upsert({
        id: recordId,
        login: String(nextPayload.login || currentAuth?.login || recordId),
        password_hash: String(currentAuth?.password_hash || nextPayload.password_hash || ""),
        is_active: nextPayload.is_active !== false,
        profile,
        source_updated_at: now,
      }, { onConflict: "id" });
      if (authError) throw authError;

      const { error: membershipWriteError } = await supabase.from("organization_members").upsert({
        organization_id: session.organization_id,
        collaborator_id: recordId,
        role: organizationRoleForAccessLevel(nextPayload.access_level),
        status: nextPayload.is_active === false ? "suspended" : "active",
      }, { onConflict: "organization_id,collaborator_id" });
      if (membershipWriteError) throw membershipWriteError;
    }

    return json({ data: sanitizePayload(entity, nextPayload) }, 200, origin);
  }

  if (operation === "bulkCreate") {
    const values = Array.isArray(body.data) ? body.data : [];
    const rows = values.map((value) => {
      const payload = { ...(value as Record<string, unknown>) };
      const id = String(payload.id || crypto.randomUUID().replaceAll("-", ""));
      payload.id = id;
      const now = new Date().toISOString();
      delete payload.organization_id;
      return { entity, record_id: id, organization_id: session.organization_id, payload, source_created_at: payload.created_date || now, source_updated_at: now };
    });
    if (cutoverWritePlan.mode === "relational" && cutoverWritePlan.writer === "financial-rpc") {
      const { data, error } = await supabase.rpc("maestro_upsert_financial_entries_scoped", {
        p_organization_id: session.organization_id,
        p_entries: rows.map((row) => row.payload),
      });
      if (error) throw error;
      return json({ data }, 200, origin);
    }
    const { error } = await supabase.from("legacy_records").upsert(rows, { onConflict: "entity,record_id" });
    if (error) throw error;
    return json({ data: rows.map((row) => row.payload) }, 200, origin);
  }

  if (operation === "delete") {
    const recordId = String(body.id || "");
    if (cutoverWritePlan.mode === "relational") {
      let result;
      if (cutoverWritePlan.writer === "project-delete-rpc" || cutoverWritePlan.writer === "financial-delete-rpc") {
        result = await supabase.rpc(cutoverWritePlan.writer === "project-delete-rpc"
          ? "maestro_delete_project_scoped"
          : "maestro_delete_financial_entry_scoped", {
          p_organization_id: session.organization_id,
          p_record_id: recordId,
          p_actor_id: session.sub,
          p_actor_name: String(session.display_name || ""),
        });
      } else {
        result = await supabase.rpc("maestro_write_frozen_core_with_history", {
          p_organization_id: session.organization_id,
          p_entity: entity,
          p_action: "delete",
          p_record_id: recordId,
          p_payload: {},
          p_actor_id: session.sub,
          p_actor_name: String(session.display_name || ""),
        });
      }
      if (result.error) throw result.error;
      return json({ data: result.data || { id: recordId, deleted: true } }, 200, origin);
    }
    const { error } = await supabase.from("legacy_records").delete()
      .eq("entity", entity)
      .eq("record_id", recordId)
      .eq("organization_id", session.organization_id);
    if (error) throw error;
    return json({ data: { id: recordId } }, 200, origin);
  }

  return json({ error: "Operação não suportada" }, 400, origin);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = token ? await verifySession(token) : null;
    if (!session) return json({ error: "Sessão inválida ou expirada" }, 401, origin);
    const body = await request.json() as Record<string, unknown>;
    body.__access_level = session.access_level;
    return await handleOperation(body, origin, session);
  } catch (error) {
    console.error("Maestro data error:", error);
    return json({ error: "Erro ao processar a operação" }, 500, origin);
  }
});
