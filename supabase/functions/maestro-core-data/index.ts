import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { collaboratorCanReadJob } from "../_shared/attachment-access.js";
import { authorizeCollaboratorJobPatch, canReadFinancialData, collaboratorJobPatchAllowed, collaboratorSubtaskCreateAllowed } from "../_shared/mutation-access.js";
import { loadCurrentCollaboratorSession } from "../_shared/session-authorization.js";
import { listRelationalJobHistoryRows } from "../_shared/relational-job-history.js";
import { mergeProjectSchedulePatch } from "../_shared/project-schedule.js";
import { buildRenewedSessionClaims } from "../_shared/session-renewal.mjs";
import { buildSafeEdgeErrorContext } from "../_shared/safe-edge-error-context.mjs";
import { normalizeEntries } from "./financial-entry-bulk-write.mjs";
import { resolveCoreDataCorsOrigin } from "./cors-policy.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const entities = new Set(["Project", "Job", "Subtask", "FinancialEntry", "JobHistory"]);
const encoder = new TextEncoder();

type Session = {
  sub: string;
  exp: number;
  access_level?: string;
  display_name?: string;
  organization_id?: string;
  permissions?: Record<string, unknown>;
};
type Row = { entity: string; record_id: string; payload: Record<string, unknown>; source_created_at: string | null; source_updated_at: string | null };

function response(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), { status, headers: {
    "Access-Control-Allow-Origin": resolveCoreDataCorsOrigin(origin),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "X-Maestro-Session",
    "Content-Type": "application/json",
  } });
}

function decode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(normalized);
}

async function authenticate(token: string): Promise<Session | null> {
  if (!sessionSecret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await crypto.subtle.importKey("raw", encoder.encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  let claims: Session;
  try {
    const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(signature), (c) => c.charCodeAt(0)), encoder.encode(body));
    if (!valid) return null;
    claims = JSON.parse(decode(body)) as Session;
  } catch { return null; }
  if (!claims.sub || !claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  const current = await loadCurrentCollaboratorSession(db, claims);
  if (!current?.organization_id) return null;
  const [{ data: collaborator, error: collaboratorError }, { data: products, error: productError }] = await Promise.all([
    db.from("maestro_collaborators").select("profile").eq("id", current.sub).maybeSingle(),
    db.from("organization_products").select("product_key").eq("organization_id", current.organization_id).in("status", ["trial", "enabled"]),
  ]);
  if (collaboratorError || productError || !products?.some((item) => item.product_key === "maestro")) return null;
  const profile = (collaborator?.profile || {}) as Record<string, unknown>;
  return {
    ...current,
    display_name: String(profile.name || profile.full_name || current.sub),
    permissions: profile.permissions && typeof profile.permissions === "object" ? profile.permissions as Record<string, unknown> : {},
  };
}

async function renewSession(session: Session) {
  const claims = buildRenewedSessionClaims(session);
  const body = btoa(JSON.stringify(claims)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const key = await crypto.subtle.importKey("raw", encoder.encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

function normalizePage(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, Math.floor(parsed))) : fallback;
}

function matches(payload: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([field, expected]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return true;
    const actual = payload[field];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const op = expected as Record<string, unknown>;
      if (op.eq !== undefined && String(actual ?? "") !== String(op.eq)) return false;
      if (Array.isArray(op.in) && !op.in.map(String).includes(String(actual ?? ""))) return false;
      if (Array.isArray(op.not_in) && op.not_in.map(String).includes(String(actual ?? ""))) return false;
      if (op.gte !== undefined && String(actual ?? "") < String(op.gte)) return false;
      if (op.lte !== undefined && String(actual ?? "") > String(op.lte)) return false;
      if (op.include_null === true && actual == null) return true;
      return true;
    }
    if (expected === null) return actual == null;
    if (Array.isArray(expected)) return JSON.stringify(expected) === JSON.stringify(actual);
    return String(actual ?? "") === String(expected);
  });
}

async function listLegacy(entity: string, body: Record<string, unknown>, session: Session): Promise<Row[]> {
  const organizationId = String(session.organization_id);
  const filters = body.filters && typeof body.filters === "object" ? body.filters as Record<string, unknown> : {};
  if (entity === "FinancialEntry" && !canReadFinancialData(session)) throw new Error("Dados financeiros exigem acesso explícito ao Financeiro ou aos Relatórios");

  if (entity === "JobHistory" && !["master", "gestor"].includes(String(session.access_level).toLowerCase())) {
    const jobId = String(filters.job_id || "");
    if (!jobId) throw new Error("Informe o job para consultar o histórico");
    const [{ data: job, error: jobError }, { data: subtasks, error: taskError }] = await Promise.all([
      db.from("legacy_records").select("record_id,payload").eq("organization_id", organizationId).eq("entity", "Job").eq("record_id", jobId).maybeSingle(),
      db.from("legacy_records").select("payload").eq("organization_id", organizationId).eq("entity", "Subtask").eq("payload->>job_id", jobId),
    ]);
    if (jobError) throw jobError;
    if (taskError) throw taskError;
    if (!job || !collaboratorCanReadJob({ accessLevel: String(session.access_level), collaboratorId: session.sub, jobPayload: { ...job.payload, id: job.record_id }, subtasks: subtasks || [] })) {
      throw new Error("Você não está atribuído a este job");
    }
  }

  const offset = normalizePage(body.offset, 0, 1_000_000);
  const limit = normalizePage(body.limit, 100, 10_000);
  const requestedSort = String(body.sort || "-updated_date");
  const sort = /^[+-]?[A-Za-z_][A-Za-z0-9_]*$/.test(requestedSort) ? requestedSort : "-updated_date";
  const descending = sort.startsWith("-");
  const sortField = descending ? sort.slice(1) : sort;
  let query = db.from("legacy_records").select("entity,record_id,payload,source_created_at,source_updated_at")
    .eq("organization_id", organizationId).eq("entity", entity);
  const jobFilter = filters.job_id && typeof filters.job_id === "object" && !Array.isArray(filters.job_id)
    ? (filters.job_id as Record<string, unknown>).eq
    : filters.job_id;
  if (entity === "JobHistory" && jobFilter != null && !Array.isArray(jobFilter)) query = query.eq("payload->>job_id", String(jobFilter));
  const jobIdFilter = filters.job_id && typeof filters.job_id === "object" && !Array.isArray(filters.job_id)
    ? filters.job_id as Record<string, unknown>
    : {};
  if (entity === "JobHistory" && Array.isArray(jobIdFilter.in)) query = query.in("payload->>job_id", jobIdFilter.in.map(String));
  const { data, error } = await query.order("source_updated_at", { ascending: false, nullsFirst: false })
    .order("record_id", { ascending: true }).range(0, 9999);
  if (error) throw error;
  const rows = ((data || []) as Row[]).filter((row) => matches(row.payload || {}, filters));
  rows.sort((a, b) => {
    const av = sortField === "created_date" ? a.source_created_at : sortField === "updated_date" ? a.source_updated_at : a.payload[sortField];
    const bv = sortField === "created_date" ? b.source_created_at : sortField === "updated_date" ? b.source_updated_at : b.payload[sortField];
    return (String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) || a.record_id.localeCompare(b.record_id)) * (descending ? -1 : 1);
  });
  return rows.slice(offset, offset + limit);
}

async function listRows(entity: string, body: Record<string, unknown>, session: Session): Promise<Row[]> {
  const org = String(session.organization_id);
  let filters = (body.filters || {}) as Record<string, unknown>;
  if (entity === "JobHistory") {
    if (!["master", "admin", "gestor"].includes(String(session.access_level).toLowerCase())) {
      const requested = filters.job_id;
      const explicitIds = typeof requested === "string" ? [requested]
        : requested && typeof requested === "object" && !Array.isArray(requested)
          ? (requested as Record<string, unknown>).eq !== undefined
            ? [String((requested as Record<string, unknown>).eq)]
            : Array.isArray((requested as Record<string, unknown>).in)
              ? ((requested as Record<string, unknown>).in as unknown[]).map(String)
              : []
          : [];
      let ids: string[];
      if (explicitIds.length) {
        for (const jobId of explicitIds) await assertCollaboratorJob(session, jobId);
        ids = explicitIds;
      } else {
        const [legacyJobs, legacyTasks, relationalJobs, relationalTasks] = await Promise.all([
          db.from("legacy_records").select("record_id,payload").eq("organization_id", org).eq("entity", "Job").eq("payload->>responsible_id", session.sub).limit(10000),
          db.from("legacy_records").select("payload").eq("organization_id", org).eq("entity", "Subtask").eq("payload->>responsible_id", session.sub).limit(10000),
          db.from("maestro_jobs").select("legacy_record_id").eq("organization_id", org).eq("source_payload->>responsible_id", session.sub).limit(10000),
          db.from("maestro_job_tasks").select("legacy_job_record_id").eq("organization_id", org).eq("responsible_id", session.sub).limit(10000),
        ]);
        for (const result of [legacyJobs, legacyTasks, relationalJobs, relationalTasks]) {
          if (result.error && result.error.code !== "42P01" && result.error.code !== "PGRST205") throw result.error;
        }
        ids = [...new Set([
          ...(legacyJobs.data || []).map((row) => String(row.record_id)),
          ...(legacyTasks.data || []).map((row) => String(row.payload?.job_id || "")),
          ...(relationalJobs.data || []).map((row) => String(row.legacy_record_id)),
          ...(relationalTasks.data || []).map((row) => String(row.legacy_job_record_id || "")),
        ].filter(Boolean))];
      }
      if (!ids.length) return [];
      filters = { ...filters, job_id: { in: ids } };
    }
    try {
      return await listRelationalJobHistoryRows(db, {
        filters, sort: String(body.sort || "-created_date"),
        offset: normalizePage(body.offset, 0, 1_000_000), limit: normalizePage(body.limit, 100, 10_000),
      }, org) as Row[];
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "42P01" && code !== "PGRST205") throw error;
    }
    return await listLegacy(entity, { ...body, filters }, session);
  }

  if (body.read_source === "relational") {
    const table = entity === "Project" ? "maestro_projects" : entity === "Job" ? "maestro_jobs" : entity === "Subtask" ? "maestro_job_tasks" : "maestro_financial_entries";
    const { data, error } = await db.from(table).select("legacy_record_id,source_payload,created_at,updated_at")
      .eq("organization_id", org).order("updated_at", { ascending: false }).order("legacy_record_id", { ascending: true }).range(0, 9999);
    if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error;
    if (!error) {
      const filters = (body.filters || {}) as Record<string, unknown>;
      const offset = normalizePage(body.offset, 0, 1_000_000);
      const limit = normalizePage(body.limit, 100, 10_000);
      const sort = String(body.sort || "-updated_date");
      const descending = sort.startsWith("-");
      const field = sort.replace(/^[+-]/, "");
      return (data || []).map((item) => ({
        entity,
        record_id: String(item.legacy_record_id),
        payload: { ...(item.source_payload || {}), id: String(item.legacy_record_id) },
        source_created_at: item.created_at || null,
        source_updated_at: item.updated_at || null,
      })).filter((row) => matches(row.payload, filters))
        .sort((a, b) => {
          const av = field === "created_date" ? a.source_created_at : field === "updated_date" ? a.source_updated_at : a.payload[field];
          const bv = field === "created_date" ? b.source_created_at : field === "updated_date" ? b.source_updated_at : b.payload[field];
          return (String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) || a.record_id.localeCompare(b.record_id)) * (descending ? -1 : 1);
        }).slice(offset, offset + limit);
    }
  }
  return await listLegacy(entity, body, session);
}

async function legacyWritesAllowed(entity: string) {
  const { data, error } = await db.from("legacy_cutover_registry").select("legacy_write_allowed").eq("entity", entity).maybeSingle();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return true;
    throw error;
  }
  return data?.legacy_write_allowed !== false;
}

async function getLegacy(entity: string, id: string, org: string) {
  const { data, error } = await db.from("legacy_records").select("payload,source_created_at,source_updated_at")
    .eq("organization_id", org).eq("entity", entity).eq("record_id", id).maybeSingle();
  if (error) throw error;
  return data;
}

async function saveFrozen(entity: string, id: string, payload: Record<string, unknown>, org: string, now: string) {
  const table = entity === "Project" ? "maestro_projects" : entity === "Job" ? "maestro_jobs" : entity === "Subtask" ? "maestro_job_tasks" : "maestro_financial_entries";
  const common = { organization_id: org, legacy_record_id: id, source_payload: { ...payload, id }, updated_at: now };
  let row: Record<string, unknown>;
  if (entity === "Project") row = { ...common, client_legacy_record_id: payload.client_id || null, name: String(payload.name || "Projeto sem nome"), status: payload.status || null, reference_month: payload.reference_month || null };
  else if (entity === "Job") row = { ...common, project_legacy_record_id: payload.project_id || null, client_legacy_record_id: payload.client_id || null, title: String(payload.title || "Job sem título"), status: payload.status || null, content_type: payload.content_type || null, post_date: payload.post_date || null, briefing: payload.briefing || null, caption: payload.caption || null };
  else if (entity === "Subtask") row = { ...common, legacy_job_record_id: payload.job_id || null, title: String(payload.title || "Tarefa sem título"), status: payload.status || null, is_completed: payload.is_completed ?? null, completed_at: payload.completed_at || null, deadline: payload.deadline || null, task_order: payload.order ?? null, responsible_id: payload.responsible_id || null, responsible_name: payload.responsible_name || null, resolution_status: payload.job_id ? "linked" : "pending" };
  else row = { ...common, client_legacy_record_id: payload.client_id || null, type: payload.type || null, title: String(payload.title || "Lançamento sem título"), amount: payload.amount == null || payload.amount === "" ? null : Number(String(payload.amount).replace(",", ".")), status: payload.status || null, category: payload.category || null, subcategory_id: payload.subcategory_id || null, subcategory_name: payload.subcategory_name || null, cost_center: payload.cost_center || null, bank_account_id: payload.bank_account_id || null, bank_account_name: payload.bank_account_name || null, due_date: payload.due_date || null, competence_date: payload.competence_date || null, billing_date: payload.billing_date || null, payment_date: payload.payment_date || null, notes: payload.notes || null };
  const conflict = entity === "FinancialEntry" ? "organization_id,legacy_record_id" : "organization_id,legacy_record_id";
  const { error } = await db.from(table).upsert(row, { onConflict: conflict });
  if (error) throw error;
}

async function assertCollaboratorJob(session: Session, jobId: string) {
  const org = String(session.organization_id);
  const [{ data: legacyJob, error: jobError }, { data: legacyTasks, error: taskError }] = await Promise.all([
    db.from("legacy_records").select("record_id,payload").eq("organization_id", org).eq("entity", "Job").eq("record_id", jobId).maybeSingle(),
    db.from("legacy_records").select("payload").eq("organization_id", org).eq("entity", "Subtask").eq("payload->>job_id", jobId),
  ]);
  if (jobError) throw jobError;
  if (taskError) throw taskError;
  let job = legacyJob;
  let subtasks = legacyTasks || [];
  if (!job) {
    const [{ data: relationalJob, error: relationalJobError }, { data: relationalTasks, error: relationalTaskError }] = await Promise.all([
      db.from("maestro_jobs").select("legacy_record_id,source_payload").eq("organization_id", org).eq("legacy_record_id", jobId).maybeSingle(),
      db.from("maestro_job_tasks").select("source_payload").eq("organization_id", org).eq("legacy_job_record_id", jobId),
    ]);
    if (relationalJobError && relationalJobError.code !== "42P01" && relationalJobError.code !== "PGRST205") throw relationalJobError;
    if (relationalTaskError && relationalTaskError.code !== "42P01" && relationalTaskError.code !== "PGRST205") throw relationalTaskError;
    if (relationalJob) job = { record_id: relationalJob.legacy_record_id, payload: relationalJob.source_payload };
    subtasks = (relationalTasks || []).map((row) => ({ payload: row.source_payload }));
  }
  if (!job || !collaboratorCanReadJob({ accessLevel: String(session.access_level), collaboratorId: session.sub, jobPayload: { ...job.payload, id: job.record_id }, subtasks })) {
    throw new Error("Você não está atribuído a este job");
  }
}

async function handle(body: Record<string, unknown>, session: Session, origin: string) {
  const operation = String(body.operation || "list");
  const entity = String(body.entity || "");
  if (!entities.has(entity)) return response({ error: "Entidade não suportada neste endpoint" }, 400, origin);
  if (!session.organization_id) return response({ error: "Sessão sem organização ativa" }, 403, origin);
  const org = String(session.organization_id);
  const role = String(session.access_level || "collaborator").toLowerCase();
  if (["list", "filter"].includes(operation)) return response({ data: await listRows(entity, body, session) }, 200, origin);
  if (entity === "JobHistory") {
    if (operation !== "create") return response({ error: "O histórico de jobs é somente leitura" }, 403, origin);
    const payload = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? { ...(body.data as Record<string, unknown>) } : {};
    const jobId = String(payload.job_id || "");
    if (!jobId) return response({ error: "O histórico precisa estar vinculado a um job" }, 400, origin);
    if (!["master", "admin", "gestor"].includes(role)) await assertCollaboratorJob(session, jobId);
    else {
      const [{ data: legacyJob, error }, { data: relationalJob, error: relationalError }] = await Promise.all([
        db.from("legacy_records").select("record_id").eq("organization_id", org).eq("entity", "Job").eq("record_id", jobId).maybeSingle(),
        db.from("maestro_jobs").select("legacy_record_id").eq("organization_id", org).eq("legacy_record_id", jobId).maybeSingle(),
      ]);
      if (error) throw error;
      if (relationalError && relationalError.code !== "42P01" && relationalError.code !== "PGRST205") throw relationalError;
      if (!legacyJob && !relationalJob) return response({ error: "Job não encontrado" }, 404, origin);
    }
    const id = String(payload.id || crypto.randomUUID().replaceAll("-", ""));
    const now = new Date().toISOString();
    payload.id = id;
    const { data, error } = await db.rpc("maestro_append_job_history_scoped", {
      p_organization_id: org,
      p_record_id: id,
      p_payload: payload,
    });
    if (error?.code === "23505" || /already exists/i.test(error?.message || "")) {
      return response({ error: "Este evento de histórico já existe e não pode ser sobrescrito" }, 409, origin);
    }
    if (error) throw error;
    return response({ data }, 200, origin);
  }
  if (operation === "bulkCreate" && entity === "FinancialEntry") {
    if (role !== "master" && role !== "admin") return response({ error: "Somente Master pode alterar lançamentos financeiros" }, 403, origin);
    let entries: Record<string, unknown>[];
    try {
      entries = normalizeEntries(body.data);
    } catch (error) {
      return response({ error: error instanceof Error ? error.message : "Lote financeiro inválido" }, 400, origin);
    }
    const { data, error } = await db.rpc("maestro_upsert_financial_entries_scoped", {
      p_organization_id: org,
      p_entries: entries,
    });
    if (error) throw error;
    return response({ data: Array.isArray(data) ? data : entries }, 200, origin);
  }
  if (!["create", "update", "delete"].includes(operation)) return response({ error: "Operação não suportada" }, 400, origin);
  const id = operation === "update" || operation === "delete" ? String(body.id || "") : String((body.data as Record<string, unknown> | undefined)?.id || crypto.randomUUID().replaceAll("-", ""));
  if (!id) return response({ error: "ID inválido" }, 400, origin);
  const rawPayload = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? { ...(body.data as Record<string, unknown>) } : {};
  let allowed = await legacyWritesAllowed(entity);
  let current = operation === "create" ? null : await getLegacy(entity, id, org);
  if (operation !== "create" && !allowed && entity === "FinancialEntry") {
    const { data, error } = await db.from("maestro_financial_entries").select("source_payload,created_at,updated_at")
      .eq("organization_id", org).eq("legacy_record_id", id).maybeSingle();
    if (error) throw error;
    if (data?.source_payload) current = { payload: data.source_payload, source_created_at: data.created_at, source_updated_at: data.updated_at };
  } else if (operation !== "create" && !current?.payload && !allowed && ["Project", "Job", "Subtask"].includes(entity)) {
    const table = entity === "Project" ? "maestro_projects" : entity === "Job" ? "maestro_jobs" : entity === "Subtask" ? "maestro_job_tasks" : "maestro_financial_entries";
    const { data, error } = await db.from(table).select("source_payload,created_at,updated_at").eq("organization_id", org).eq("legacy_record_id", id).maybeSingle();
    if (error) throw error;
    if (data?.source_payload) current = { payload: data.source_payload, source_created_at: data.created_at, source_updated_at: data.updated_at };
  }
  if (operation !== "create" && !current?.payload) return response({ error: "Registro não encontrado" }, 404, origin);
  const payload = operation === "update" ? { ...current!.payload, ...rawPayload, id } : { ...rawPayload, id };

  if (entity === "FinancialEntry") {
    if (role !== "master" && role !== "admin") return response({ error: "Somente Master pode alterar lançamentos financeiros" }, 403, origin);
  } else if (entity === "Project") {
    if (!["master", "admin", "gestor"].includes(role)) return response({ error: "Sem permissão para alterar projetos" }, 403, origin);
  } else if (entity === "Job" && role === "collaborator") {
    if (operation === "create" || operation === "delete" || !await authorizeCollaboratorJobPatch(rawPayload, () => assertCollaboratorJob(session, id))) return response({ error: "Colaboradores só podem atualizar campos operacionais autorizados dos próprios jobs" }, 403, origin);
  } else if (entity === "Subtask" && role === "collaborator") {
    if (operation === "delete") return response({ error: "Colaboradores não podem excluir tarefas" }, 403, origin);
    if (operation === "create") {
      if (!collaboratorSubtaskCreateAllowed(rawPayload)) return response({ error: "A tarefa contém campos não autorizados ou está incompleta" }, 403, origin);
      await assertCollaboratorJob(session, String(rawPayload.job_id || ""));
    } else {
      const allowed = new Set(["status", "is_completed", "completed_at", "complete_at_status", "deadline", "order", "title"]);
      if (!Object.keys(rawPayload).length || Object.keys(rawPayload).some((key) => !allowed.has(key))) return response({ error: "Colaboradores só podem atualizar campos operacionais autorizados da tarefa" }, 403, origin);
      await assertCollaboratorJob(session, String(current!.payload.job_id || ""));
    }
  } else if (!["master", "admin", "gestor"].includes(role)) return response({ error: "Sem permissão para alterar este registro" }, 403, origin);

  if (entity === "FinancialEntry") {
    const { data, error } = await db.rpc("maestro_upsert_financial_entries_scoped", {
      p_organization_id: org,
      p_entries: [payload],
    });
    if (error) throw error;
    return response({ data: Array.isArray(data) ? data[0] : payload }, 200, origin);
  }

  const now = new Date().toISOString();
  if (entity === "Project" && operation === "update" && rawPayload.schedule_patch) {
    if (allowed) {
      const { data, error } = await db.rpc("maestro_patch_project_schedule_scoped", { p_organization_id: org, p_record_id: id, p_patch: rawPayload.schedule_patch, p_actor_id: session.sub, p_actor_name: session.display_name || "Sistema" });
      if (error) throw error;
      return response({ data }, 200, origin);
    }
    const { data: project, error } = await db.from("maestro_projects").select("source_payload").eq("organization_id", org).eq("legacy_record_id", id).maybeSingle();
    if (error) throw error;
    if (!project?.source_payload) return response({ error: "Projeto não encontrado" }, 404, origin);
    const remaining = { ...rawPayload };
    delete remaining.schedule_patch;
    const next = { ...mergeProjectSchedulePatch(project.source_payload, rawPayload.schedule_patch), ...remaining, id };
    await saveFrozen(entity, id, next, org, now);
    return response({ data: next }, 200, origin);
  }

  if (!allowed && ["Job", "Subtask"].includes(entity)) {
    const { data, error } = await db.rpc("maestro_write_frozen_core_with_history", {
      p_organization_id: org,
      p_entity: entity,
      p_action: operation,
      p_record_id: id,
      p_payload: payload,
      p_actor_id: session.sub,
      p_actor_name: session.display_name || "Sistema",
    });
    if (error) throw error;
    return response({ data }, 200, origin);
  }

  if (entity === "FinancialEntry" && operation === "delete") {
    const { data, error } = await db.rpc("maestro_delete_financial_entry_scoped", { p_organization_id: org, p_record_id: id, p_actor_id: session.sub, p_actor_name: session.display_name || "Sistema" });
    if (error) throw error;
    return response({ data }, 200, origin);
  }
  if (entity === "FinancialEntry") {
    if (allowed) {
      const { error } = await db.from("legacy_records").upsert({ entity, record_id: id, organization_id: org, payload, source_created_at: current?.source_created_at || now, source_updated_at: now }, { onConflict: "entity,record_id" });
      if (error) throw error;
    } else {
      await saveFrozen(entity, id, payload, org, now);
    }
    return response({ data: payload }, 200, origin);
  }
  if (operation === "delete" && entity === "Project") {
    const { data, error } = await db.rpc("maestro_delete_project_scoped", { p_organization_id: org, p_record_id: id, p_actor_id: session.sub, p_actor_name: session.display_name || "Sistema" });
    if (error) throw error;
    return response({ data }, 200, origin);
  }
  if (!allowed && entity === "Project") {
    await saveFrozen(entity, id, payload, org, now);
    return response({ data: payload }, 200, origin);
  }
  const { data, error } = await db.rpc("maestro_apply_legacy_mutation_scoped", { p_organization_id: org, p_action: operation, p_entity: entity, p_record_id: id, p_payload: rawPayload, p_actor_id: session.sub, p_actor_name: session.display_name || "Sistema" });
  if (error) throw error;
  return response({ data }, 200, origin);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const requestId = crypto.randomUUID();
  let stage = "authenticate";
  let operation: unknown;
  let entity: unknown;
  if (request.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": resolveCoreDataCorsOrigin(origin), "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (request.method !== "POST") return response({ error: "Método não permitido" }, 405, origin);
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    const session = await authenticate(token);
    if (!session) return response({ error: "Sessão inválida ou expirada" }, 401, origin);
    stage = "parse_body";
    const body = await request.json() as Record<string, unknown>;
    operation = body.operation;
    entity = body.entity;
    stage = "handle";
    const result = await handle(body, session, origin);
    if (result.status < 400 && session.exp - Math.floor(Date.now() / 1000) <= 12 * 60 * 60) result.headers.set("X-Maestro-Session", await renewSession(session));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar a operação";
    const status = /permiss|atribuído|financeiros/.test(message) ? 403 : 500;
    if (status >= 500) console.error(JSON.stringify(buildSafeEdgeErrorContext({ requestId, method: request.method, operation, entity, stage, status, error })));
    return response({ error: message }, status, origin);
  }
});
