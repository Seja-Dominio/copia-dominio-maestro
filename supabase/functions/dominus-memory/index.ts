import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const origins = new Set([
  "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:4174", "http://localhost:4174",
  "http://127.0.0.1:4175", "http://localhost:4175", "http://127.0.0.1:5173", "http://localhost:5173",
  "https://dominiomaestro.com.br",
]);

type Session = {
  sub: string;
  exp: number;
  access_level: string;
  permissions: Record<string, unknown>;
  scope?: "user" | "group";
  authenticated?: boolean;
};

const VALID_SCOPES = new Set(["agency", "team", "user", "group"]);
const REVIEW_COLUMNS = "id,memory_key,status,proposed_rule,rationale,scope,scope_id,evidence,source_refs,proposed_at,proposed_by,reviewed_at,reviewed_by,review_note,created_at,updated_at";
const MEMORY_COLUMNS = "id,memory_key,rule,scope,scope_id,status,version,source_review_id,approved_at,approved_by,retired_at,retired_by,created_at,updated_at";
const COMMENT_COLUMNS = "id,review_id,author_id,body,created_at,updated_at";
const EVENT_COLUMNS = "id,review_id,event_type,actor_id,note,snapshot,created_at";

function decode(value: string) {
  return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
}

function normalizeLevel(value: unknown) {
  const level = String(value || "collaborator").toLowerCase();
  return level === "admin" ? "master" : level;
}

function isMaster(session: Session) {
  return session.scope === "user" && session.authenticated === true && normalizeLevel(session.access_level) === "master";
}

async function verifySession(token: string): Promise<Session | null> {
  if (!sessionSecret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(decode(signature), character => character.charCodeAt(0)),
    new TextEncoder().encode(body),
  );
  if (!valid) return null;
  let payload: Record<string, any>;
  try { payload = JSON.parse(decode(body)); } catch { return null; }
  if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000) || payload.scope !== "user") return null;

  const { data } = await db
    .from("maestro_collaborators")
    .select("id,is_active,profile")
    .eq("id", payload.sub)
    .maybeSingle();
  if (!data?.is_active) return null;
  const profile = (data.profile || {}) as Record<string, unknown>;
  return {
    sub: String(data.id),
    exp: Number(payload.exp),
    access_level: normalizeLevel(profile.access_level || payload.access_level),
    permissions: (profile.permissions || {}) as Record<string, unknown>,
    scope: "user",
    authenticated: true,
  };
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://dominiomaestro.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function text(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validScope(scope: string, scopeId: string | null) {
  return VALID_SCOPES.has(scope) && (scope === "agency" || Boolean(scopeId));
}

function sameScope(row: { scope?: string; scope_id?: string | null }, scope: string, scopeId: string | null) {
  return row.scope === scope && String(row.scope_id || "") === String(scopeId || "");
}

async function listMemory() {
  const [reviews, memories] = await Promise.all([
    db.from("dominus_learning_reviews").select(REVIEW_COLUMNS).order("proposed_at", { ascending: false }).limit(100),
    db.from("dominus_memory").select(MEMORY_COLUMNS).order("updated_at", { ascending: false }).limit(200),
  ]);
  if (reviews.error) throw reviews.error;
  if (memories.error) throw memories.error;
  const reviewIds = (reviews.data || []).map((item: any) => String(item.id)).filter(Boolean);
  const [comments, events] = await Promise.all([
    reviewIds.length
      ? db.from("dominus_learning_review_comments").select(COMMENT_COLUMNS).in("review_id", reviewIds).order("created_at", { ascending: true })
      : { data: [], error: null },
    reviewIds.length
      ? db.from("dominus_learning_review_events").select(EVENT_COLUMNS).in("review_id", reviewIds).order("created_at", { ascending: false })
      : { data: [], error: null },
  ]);
  if (comments.error) throw comments.error;
  if (events.error) throw events.error;
  const authorIds = [...new Set((comments.data || []).map((item: any) => String(item.author_id || "")).filter(Boolean))];
  const authors = authorIds.length
    ? await db.from("maestro_collaborators").select("id,profile").in("id", authorIds)
    : { data: [], error: null };
  if (authors.error) throw authors.error;
  const authorNames = new Map((authors.data || []).map((item: any) => [String(item.id), String(item.profile?.full_name || item.profile?.name || item.profile?.display_name || item.id)]));
  const commentsWithAuthors = (comments.data || []).map((item: any) => ({ ...item, author_name: authorNames.get(String(item.author_id)) || "Master" }));
  const eventsWithAuthors = (events.data || []).map((item: any) => ({ ...item, actor_name: authorNames.get(String(item.actor_id)) || (item.actor_id === "dominus-audit" ? "Auditoria do Dominus" : "Master") }));
  return { reviews: reviews.data || [], memories: memories.data || [], comments: commentsWithAuthors, events: eventsWithAuthors };
}

async function recordEvent(reviewId: string, eventType: string, session: Session, note = "", snapshot: Record<string, unknown> = {}) {
  const { error } = await db.from("dominus_learning_review_events").insert({
    review_id: reviewId,
    event_type: eventType,
    actor_id: session.sub,
    note: text(note, 4000),
    snapshot,
  });
  if (error) throw error;
}

async function approveReview(body: Record<string, any>, session: Session) {
  const reviewId = text(body.review_id, 100);
  if (!reviewId) throw new Error("Aprendizado não informado.");
  const { data: review, error: reviewError } = await db
    .from("dominus_learning_reviews")
    .select(REVIEW_COLUMNS)
    .eq("id", reviewId)
    .maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) throw new Error("Aprendizado não encontrado.");
  if (review.status !== "pending") throw new Error("Esse aprendizado já foi revisado.");

  const rule = text(body.rule || review.proposed_rule, 4000);
  const rationale = text(body.rationale ?? review.rationale, 4000);
  const scope = text(body.scope || review.scope || "agency", 20).toLowerCase();
  const scopeId = scope === "agency" ? null : text(body.scope_id ?? review.scope_id, 200) || null;
  const note = text(body.note, 4000);
  if (!rule) throw new Error("A regra não pode ficar vazia.");
  if (!validScope(scope, scopeId)) throw new Error("Escopo inválido: informe o identificador para regras de grupo, equipe ou usuário.");

  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await db
    .from("dominus_memory")
    .select("id,version,memory_key,scope,scope_id,status")
    .eq("memory_key", text(review.memory_key, 200))
    .eq("scope", scope)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1);
  if (existingError) throw existingError;
  const active = (existing || []).find((item: any) => sameScope(item, scope, scopeId));

  const { data: versions, error: versionsError } = await db
    .from("dominus_memory")
    .select("version,scope,scope_id")
    .eq("memory_key", text(review.memory_key, 200))
    .eq("scope", scope)
    .order("version", { ascending: false })
    .limit(200);
  if (versionsError) throw versionsError;
  const version = Math.max(0, ...(versions || [])
    .filter((item: any) => sameScope(item, scope, scopeId))
    .map((item: any) => Number(item.version) || 0)) + 1;

  // Stage the new version as retired first. This keeps the previous active
  // rule intact if a later operation fails halfway through the approval.
  const { data: staged, error: stageError } = await db
    .from("dominus_memory")
    .insert({
      memory_key: text(review.memory_key, 200),
      rule,
      scope,
      scope_id: scopeId,
      status: "retired",
      version,
      source_review_id: review.id,
      approved_at: now,
      approved_by: session.sub,
      retired_at: now,
      retired_by: session.sub,
    })
    .select(MEMORY_COLUMNS)
    .single();
  if (stageError) throw stageError;

  if (active?.id) {
    const { error: retireError } = await db
      .from("dominus_memory")
      .update({ status: "retired", retired_at: now, retired_by: session.sub, updated_at: now })
      .eq("id", active.id)
      .eq("status", "active");
    if (retireError) throw retireError;
  }

  const { data: memory, error: activateError } = await db
    .from("dominus_memory")
    .update({ status: "active", retired_at: null, retired_by: null, updated_at: now })
    .eq("id", staged.id)
    .eq("status", "retired")
    .select(MEMORY_COLUMNS)
    .single();
  if (activateError) throw activateError;

  const changed = rule !== String(review.proposed_rule || "").trim() || scope !== review.scope || String(scopeId || "") !== String(review.scope_id || "");
  const { data: updatedReview, error: updateReviewError } = await db
    .from("dominus_learning_reviews")
    .update({
      status: changed ? "edited" : "approved",
      scope,
      scope_id: scopeId,
      rationale,
      reviewed_at: now,
      reviewed_by: session.sub,
      review_note: note,
      updated_at: now,
    })
    .eq("id", review.id)
    .eq("status", "pending")
    .select(REVIEW_COLUMNS)
    .single();
  if (updateReviewError) throw updateReviewError;
  await recordEvent(review.id, changed ? "edited" : "approved", session, note, {
    rule,
    rationale,
    scope,
    scope_id: scopeId,
    status: changed ? "edited" : "approved",
  });
  return { review: updatedReview, memory };
}

async function editReview(body: Record<string, any>, session: Session) {
  const reviewId = text(body.review_id, 100);
  const rule = text(body.rule, 4000);
  const rationale = text(body.rationale, 4000);
  const scope = text(body.scope || "agency", 20).toLowerCase();
  const scopeId = scope === "agency" ? null : text(body.scope_id, 200) || null;
  if (!reviewId || !rule) throw new Error("Informe o aprendizado e a regra revisada.");
  if (!validScope(scope, scopeId)) throw new Error("Escopo inválido.");
  const { data, error } = await db
    .from("dominus_learning_reviews")
    .update({ proposed_rule: rule, rationale, scope, scope_id: scopeId, updated_at: new Date().toISOString() })
    .eq("id", reviewId)
    .eq("status", "pending")
    .select(REVIEW_COLUMNS)
    .single();
  if (error) throw error;
  await recordEvent(reviewId, "edited", session, text(body.note, 4000), { rule, rationale, scope, scope_id: scopeId, status: "pending" });
  return { review: data };
}

async function rejectReview(body: Record<string, any>, session: Session) {
  const reviewId = text(body.review_id, 100);
  if (!reviewId) throw new Error("Aprendizado não informado.");
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("dominus_learning_reviews")
    .update({ status: "rejected", reviewed_at: now, reviewed_by: session.sub, review_note: text(body.note, 4000), updated_at: now })
    .eq("id", reviewId)
    .eq("status", "pending")
    .select(REVIEW_COLUMNS)
    .single();
  if (error) throw error;
  await recordEvent(reviewId, "rejected", session, text(body.note, 4000), { status: "rejected" });
  return { review: data };
}

async function addComment(body: Record<string, any>, session: Session) {
  const reviewId = text(body.review_id, 100);
  const commentBody = text(body.body ?? body.note, 4000);
  if (!reviewId || !commentBody) throw new Error("Escreva um apontamento antes de enviar.");
  const { data: review, error: reviewError } = await db
    .from("dominus_learning_reviews")
    .select("id")
    .eq("id", reviewId)
    .maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) throw new Error("Aprendizado não encontrado.");
  const { data, error } = await db
    .from("dominus_learning_review_comments")
    .insert({ review_id: reviewId, author_id: session.sub, body: commentBody })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  return { comment: data };
}

async function revertMemory(body: Record<string, any>, session: Session) {
  const memoryId = text(body.memory_id, 100);
  if (!memoryId) throw new Error("Memória ativa não informada.");
  const { data: current, error: currentError } = await db
    .from("dominus_memory")
    .select(MEMORY_COLUMNS)
    .eq("id", memoryId)
    .eq("status", "active")
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Memória ativa não encontrada.");

  const { data: previousRows, error: previousError } = await db
    .from("dominus_memory")
    .select(MEMORY_COLUMNS)
    .eq("memory_key", current.memory_key)
    .eq("scope", current.scope)
    .eq("status", "retired")
    .order("version", { ascending: false })
    .limit(200);
  if (previousError) throw previousError;
  const previous = (previousRows || []).find((item: any) => sameScope(item, current.scope, current.scope_id) && Number(item.version) < Number(current.version));
  if (!previous) throw new Error("Não existe uma versão anterior para reverter.");

  const now = new Date().toISOString();
  const nextVersion = Number(current.version) + 1;
  const { data: staged, error: stageError } = await db
    .from("dominus_memory")
    .insert({
      memory_key: current.memory_key,
      rule: previous.rule,
      scope: current.scope,
      scope_id: current.scope_id,
      status: "retired",
      version: nextVersion,
      source_review_id: previous.source_review_id,
      approved_at: now,
      approved_by: session.sub,
      retired_at: now,
      retired_by: session.sub,
    })
    .select(MEMORY_COLUMNS)
    .single();
  if (stageError) throw stageError;

  const { error: retireError } = await db
    .from("dominus_memory")
    .update({ status: "retired", retired_at: now, retired_by: session.sub, updated_at: now })
    .eq("id", current.id)
    .eq("status", "active");
  if (retireError) throw retireError;

  const { data: memory, error: activateError } = await db
    .from("dominus_memory")
    .update({ status: "active", retired_at: null, retired_by: null, updated_at: now })
    .eq("id", staged.id)
    .eq("status", "retired")
    .select(MEMORY_COLUMNS)
    .single();
  if (activateError) throw activateError;
  return { memory, reverted_from: current.id, reverted_to: previous.id };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = token ? await verifySession(token) : null;
    if (!session || !isMaster(session)) return json({ error: "Acesso exclusivo para Master autenticado" }, 403, origin);

    const body = await request.json().catch(() => ({}));
    const action = text(body.action, 30);
    if (action === "list") return json(await listMemory(), 200, origin);
    if (action === "approve") return json(await approveReview(body, session), 200, origin);
    if (action === "edit") return json(await editReview(body, session), 200, origin);
    if (action === "reject") return json(await rejectReview(body, session), 200, origin);
    if (action === "comment") return json(await addComment(body, session), 200, origin);
    if (action === "revert") return json(await revertMemory(body, session), 200, origin);
    return json({ error: "Ação não suportada" }, 400, origin);
  } catch (error) {
    console.error("Dominus memory error:", error);
    return json({ error: error instanceof Error ? error.message : "Não foi possível processar a memória do Dominus." }, 500, origin);
  }
});
