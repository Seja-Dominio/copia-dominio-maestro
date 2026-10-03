import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCompetitiveReport } from "./competitiveMetrics.ts";
import { canManageAdsBrain, isGroupAdsBrainSession, requiresAdsBrainManager } from "../_shared/ads-brain-access.js";
import { createMetaOAuthNonce, hashMetaOAuthNonce, isMetaOAuthStateBound } from "../_shared/meta-oauth-state.js";
import { scopeToOrganization } from "../_shared/organization-query.js";
import { profileForOrganizationRole, selectOrganizationMembership } from "../_shared/maestro-tenant.mjs";
import { hasActiveOrganizationProduct } from "../_shared/organization-products.mjs";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
type LegacyRecordRow = { record_id: string; payload: Record<string, unknown> | null };
type LegacyPayloadRow = { payload: Record<string, unknown> | null };
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const appId = Deno.env.get("META_APP_ID") || "";
const appSecret = Deno.env.get("META_APP_SECRET") || "";
const redirectUri = Deno.env.get("META_OAUTH_REDIRECT_URI") || "https://dominiomaestro.com.br/AdsBrain";
const META_INSIGHT_FIELDS = [
  "spend", "impressions", "reach", "frequency", "cpm", "cpp", "clicks", "ctr", "cpc",
  "inline_link_clicks", "unique_inline_link_clicks", "outbound_clicks", "unique_outbound_clicks",
  "inline_link_click_ctr", "unique_inline_link_click_ctr", "outbound_clicks_ctr",
  "cost_per_inline_link_click", "cost_per_outbound_click",
  "conversions", "cost_per_conversion", "results", "cost_per_result",
  "purchase_roas", "website_purchase_roas", "mobile_app_purchase_roas",
  "actions", "action_values", "cost_per_action_type",
].join(",");

function encode(value: string) { return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function decode(value: string) { return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); }
async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const body = encode(value);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${encode(String.fromCharCode(...new Uint8Array(sig)))}`;
}
async function verify(value: string) {
  const [body, rawSig] = value.split("."); if (!body || !rawSig || !sessionSecret) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  // Collaborator login signs the base64url-encoded payload, not the decoded JSON.
  // The OAuth function must verify the exact same representation.
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(rawSig), c => c.charCodeAt(0)), new TextEncoder().encode(body));
  if (!valid) return null;
  try {
    const state = JSON.parse(decode(body));
    return state.exp > Math.floor(Date.now() / 1000) ? state : null;
  } catch {
    return null;
  }
}
async function verifySession(value: string) {
  const state = await verify(value);
  return state;
}
async function encryptSecret(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionSecret));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return `${encode(String.fromCharCode(...iv))}.${encode(String.fromCharCode(...encrypted))}`;
}
async function decryptSecret(value: string) {
  const [rawIv, rawEncrypted] = value.split(".");
  if (!rawIv || !rawEncrypted) throw new Error("Credencial Meta inválida");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionSecret));
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(decode(rawIv), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(decode(rawEncrypted), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted));
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://dominiomaestro.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
function parseFundingSourceAmount(displayString: unknown) {
  if (typeof displayString !== "string") return null;
  const match = displayString.match(/(?:R\$|\$|€|£)\s*[-\d.,]+|\b\d[\d.,]*\s*(?:BRL|USD|EUR|GBP)\b/i);
  if (!match) return null;
  const numeric = match[0].replace(/[^\d,.-]/g, "");
  const normalized = numeric.includes(",")
    ? numeric.replace(/\./g, "").replace(",", ".")
    : numeric.replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function campaignSnapshot(campaign: Record<string, unknown>) {
  return {
    id: String(campaign.id || ""),
    name: String(campaign.name || ""),
    status: campaign.status ?? null,
    effective_status: campaign.effective_status ?? null,
    daily_budget: campaign.daily_budget ?? null,
    lifetime_budget: campaign.lifetime_budget ?? null,
    created_time: campaign.created_time ?? null,
    updated_time: campaign.updated_time ?? null,
  };
}

function campaignChangeEvents(previous: unknown, current: unknown, changedAt: string) {
  const previousMap = new Map((Array.isArray(previous) ? previous : []).map((item) => {
    const snapshot = campaignSnapshot(item as Record<string, unknown>);
    return [snapshot.id, snapshot] as const;
  }));
  const fields = [
    ["name", "Nome"],
    ["status", "Status"],
    ["effective_status", "Status efetivo"],
    ["daily_budget", "Orçamento diário"],
    ["lifetime_budget", "Orçamento vitalício"],
  ] as const;
  const events = [];
  for (const item of (Array.isArray(current) ? current : [])) {
    const snapshot = campaignSnapshot(item as Record<string, unknown>);
    if (!snapshot.id) continue;
    const before = previousMap.get(snapshot.id);
    const changes = before
      ? fields.filter(([field]) => before[field] !== snapshot[field]).map(([field, label]) => ({ field, label, from: before[field], to: snapshot[field] }))
      : [{ field: "created", label: "Campanha adicionada", from: null, to: snapshot.name }];
    if (!changes.length) continue;
    events.push({
      id: `${snapshot.id}-${changedAt}-${events.length}`,
      campaign_id: snapshot.id,
      campaign_name: snapshot.name,
      changed_at: changedAt,
      type: before ? "updated" : "created",
      changes,
    });
  }
  return events;
}

function formatActivityExtraData(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.slice(0, 180);
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${String(item)}`)
      .join(" · ")
      .slice(0, 180);
  }
  return String(value).slice(0, 180);
}

function normalizeActivityDate(value: unknown, fallback: string) {
  if (value == null || value === "") return fallback;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function metaCampaignActivityEvents(payload: unknown, campaigns: unknown[], syncedAt: string) {
  const campaignMap = new Map((Array.isArray(campaigns) ? campaigns : []).map((item) => {
    const campaign = item as Record<string, unknown>;
    return [String(campaign.id || ""), String(campaign.name || "Campanha sem nome")] as const;
  }));
  const activities = payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data)
    ? (payload as Record<string, unknown>).data as Record<string, unknown>[]
    : [];
  return activities.flatMap((activity, index) => {
    const objectId = String(activity.object_id || activity.objectId || "");
    const objectType = String(activity.object_type || activity.object_type_name || "").toLowerCase();
    const eventType = String(activity.translated_event_type || activity.event_type || "Alteração");
    const isCampaignActivity = Boolean(objectId && (campaignMap.has(objectId) || objectType.includes("campaign") || eventType.toLowerCase().includes("campaign")));
    if (!isCampaignActivity) return [];
    const campaignName = String(activity.object_name || campaignMap.get(objectId) || "Campanha sem nome");
    const extraData = formatActivityExtraData(activity.extra_data);
    return [{
      id: String(activity.id || `meta-${objectId}-${activity.event_time || syncedAt}-${activity.event_type || index}`),
      campaign_id: objectId,
      campaign_name: campaignName,
      changed_at: normalizeActivityDate(activity.event_time, syncedAt),
      type: "updated",
      source: "meta_activity",
      summary: extraData,
      changes: [{ field: "meta_activity", label: eventType, from: null, to: extraData || "Alteração registrada no Meta Ads" }],
    }];
  });
}

function hasAdsBrainAccess(profile: Record<string, unknown>) {
  const rawLevel = String(profile.access_level || "collaborator").toLowerCase();
  const accessLevel = rawLevel === "admin" ? "master" : rawLevel;
  const permissions = profile.permissions;
  const tabs = permissions && typeof permissions === "object" && !Array.isArray(permissions)
    ? (permissions as Record<string, unknown>).tabs
    : null;

  // Ads Brain is available by default to every access level. When the
  // collaborator has an explicit tab configuration, that choice is the
  // source of truth for every operation in this module.
  if (tabs && typeof tabs === "object" && !Array.isArray(tabs) && Object.prototype.hasOwnProperty.call(tabs, "AdsBrain")) {
    return (tabs as Record<string, unknown>).AdsBrain === true;
  }

  return ["master", "gestor", "collaborator"].includes(accessLevel);
}

function normalizeAdAccountId(value: unknown) {
  const raw = String(value || "").trim();
  if (!/^act_?\d+$/.test(raw)) return "";
  return raw.startsWith("act_") ? raw : `act_${raw.replace(/^act/, "")}`;
}

function isValidBudgetCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 100;
}

const CAMPAIGN_OBJECTIVES = new Set([
  "OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_APP_PROMOTION",
]);

class SafeCampaignError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function metaCampaignRequest(accessToken: string, path: string, params?: URLSearchParams) {
  const response = await fetch(`https://graph.facebook.com/v24.0/${path}`, {
    method: params ? "POST" : "GET",
    headers: params ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
    body: params ? new URLSearchParams({ ...Object.fromEntries(params), access_token: accessToken }) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    const error = payload.error || {};
    const message = String(error.error_user_msg || error.message || "A Meta recusou a operação.");
    const reconnect = Number(error.code) === 190 || Number(error.code) === 200;
    throw new SafeCampaignError(reconnect
      ? "A autorização Meta não permite gerenciar campanhas ou expirou. Reconecte a conta com a permissão ads_management."
      : message.slice(0, 400), reconnect ? 401 : 502);
  }
  return payload;
}

function requireCampaignConfirmation(body: Record<string, unknown>) {
  if (body.confirm !== true) throw new SafeCampaignError("Confirme explicitamente esta operação Meta Ads.");
}

function campaignUpdateParams(body: Record<string, unknown>) {
  const params = new URLSearchParams();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (body.name !== undefined) {
    if (!name || name.length > 255) throw new SafeCampaignError("Informe um nome de campanha entre 1 e 255 caracteres.");
    params.set("name", name);
  }
  if (body.daily_budget_cents !== undefined) {
    if (!isValidBudgetCents(body.daily_budget_cents)) throw new SafeCampaignError("O orçamento diário deve ser um valor inteiro em centavos, de no mínimo 100.");
    params.set("daily_budget", String(body.daily_budget_cents));
  }
  if (!params.size) throw new SafeCampaignError("Informe pelo menos um campo permitido para editar.");
  return params;
}

function shiftDate(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousPeriod(since: string, until: string) {
  const start = new Date(`${since}T12:00:00Z`);
  const end = new Date(`${until}T12:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return { since: shiftDate(since, -days), until: shiftDate(since, -1) };
}

function actionTotal(actions: unknown, matcher: (type: string) => boolean) {
  if (!Array.isArray(actions)) return null;
  const total = actions
    .filter((item: any) => matcher(String(item?.action_type || "")))
    .reduce((sum, item: any) => sum + Number(item?.value || 0), 0);
  return Number.isFinite(total) ? total : null;
}

function isMessagingConversationStarted(type: string) {
  return /messaging_conversation_started(?:_7d)?/i.test(type);
}

function resolveMessagingCost(insight: Record<string, unknown> = {}) {
  const direct = insight.cost_per_messaging_conversation_started;
  if (direct != null && direct !== "" && Number.isFinite(Number(direct))) return Number(direct);
  const actionCost = Array.isArray(insight.cost_per_action_type)
    ? insight.cost_per_action_type.find((item: any) => isMessagingConversationStarted(String(item?.action_type || "")))?.value
    : null;
  if (actionCost != null && actionCost !== "" && Number.isFinite(Number(actionCost))) return Number(actionCost);
  const conversations = actionTotal(insight.actions, isMessagingConversationStarted);
  const spend = Number(insight.spend);
  return conversations != null && conversations > 0 && Number.isFinite(spend) ? spend / conversations : null;
}

function normalizeReportMetrics(insight: Record<string, unknown> = {}) {
  return {
    ...insight,
    spend: Number.isFinite(Number(insight.spend)) ? Number(insight.spend) : null,
    impressions: Number.isFinite(Number(insight.impressions)) ? Number(insight.impressions) : null,
    reach: Number.isFinite(Number(insight.reach)) ? Number(insight.reach) : null,
    clicks: Number.isFinite(Number(insight.clicks)) ? Number(insight.clicks) : null,
    ctr: Number.isFinite(Number(insight.ctr)) ? Number(insight.ctr) : null,
    cpc: Number.isFinite(Number(insight.cpc)) ? Number(insight.cpc) : null,
    cpm: Number.isFinite(Number(insight.cpm)) ? Number(insight.cpm) : null,
    cost_per_messaging_conversation_started: resolveMessagingCost(insight),
    messaging_conversations_started: actionTotal(insight.actions, isMessagingConversationStarted),
    frequency: Number.isFinite(Number(insight.frequency)) ? Number(insight.frequency) : null,
    actions_raw: Array.isArray(insight.actions) ? insight.actions : [],
    action_values_raw: Array.isArray(insight.action_values) ? insight.action_values : [],
    cost_per_action_type_raw: Array.isArray(insight.cost_per_action_type) ? insight.cost_per_action_type : [],
    leads: actionTotal(insight.actions, (type) => /(^|[._])lead(s)?($|[._])|lead/i.test(type)),
    purchases: actionTotal(insight.actions, (type) => /purchase/i.test(type)),
    messages: actionTotal(insight.actions, (type) => /messaging|message/i.test(type)),
  };
}

async function fetchReportMetrics(accessToken: string, accountId: string, range: { since: string; until: string }) {
  const query = new URLSearchParams({
    time_range: JSON.stringify(range),
    fields: META_INSIGHT_FIELDS,
    time_increment: "all_days",
    limit: "1",
    access_token: accessToken,
  });
  const response = await fetch(`https://graph.facebook.com/v24.0/${accountId}/insights?${query}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.error_user_msg || payload.error.message || "Falha ao consultar insights da Meta");
  return normalizeReportMetrics(payload.data?.[0] || {});
}

async function loadCompetitiveContext(clientId: string, organizationId: string, clientName = "") {
  const clientQuery = scopeToOrganization(supabase
    .from("legacy_records")
    .select("record_id,payload")
    .eq("entity", "Client"), organizationId);
  const { data: clientRows, error: clientError } = clientId
    ? await clientQuery.eq("record_id", clientId).limit(1)
    : await clientQuery.filter("payload->>name", "eq", clientName).limit(1);
  if (clientError) throw clientError;
  const clientRow = clientRows?.[0];
  if (!clientRow) return null;
  const resolvedClientId = String(clientRow.record_id || clientId || "");
  const resolvedClientName = String(clientRow.payload?.name || clientName || "Cliente não identificado");
  const [competitorRows, insightRows, postRows] = await Promise.all([
    scopeToOrganization(supabase.from("legacy_records").select("record_id,payload").eq("entity", "ClientCompetitor").filter("payload->>client_id", "eq", resolvedClientId), organizationId).limit(50),
    scopeToOrganization(supabase.from("legacy_records").select("payload").eq("entity", "ClientInsight").filter("payload->>client_id", "eq", resolvedClientId), organizationId).limit(200),
    scopeToOrganization(supabase.from("legacy_records").select("payload").eq("entity", "PostMetric").filter("payload->>client_id", "eq", resolvedClientId), organizationId).limit(200),
  ]);
  if (competitorRows.error) throw competitorRows.error;
  if (insightRows.error) throw insightRows.error;
  if (postRows.error) throw postRows.error;
  return {
    clientId: resolvedClientId,
    clientName: resolvedClientName,
    instagramAccountId: String(clientRow.payload?.instagram_account_id || ""),
    competitors: (competitorRows.data || []).map((row: LegacyRecordRow) => ({ id: row.record_id, ...(row.payload || {}) })),
    ownInsights: (insightRows.data || []).map((row: LegacyPayloadRow) => row.payload || {}),
    ownPosts: (postRows.data || []).map((row: LegacyPayloadRow) => row.payload || {}),
  };
}

async function loadMetaAccessForClient(context: { clientName: string }, organizationId?: string) {
  const { data: account, error: accountError } = await supabase
    .from("maestro_ads_accounts")
    .select("authorization_id")
    .eq("network", "Meta Ads").eq("organization_id", organizationId || "")
    .eq("client_name", context.clientName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account?.authorization_id) return null;
  const { data: authorization, error: authorizationError } = await supabase
    .from("maestro_ads_authorizations")
    .select("access_token_encrypted,token_expires_at")
    .eq("id", account.authorization_id).eq("organization_id", organizationId || "")
    .maybeSingle();
  if (authorizationError) throw authorizationError;
  if (!authorization) return null;
  if (authorization.token_expires_at && new Date(authorization.token_expires_at).getTime() < Date.now()) return null;
  return decryptSecret(authorization.access_token_encrypted);
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);
    if (!sessionSecret || !appId || !appSecret) return json({ error: "Integração Meta ainda não configurada no ambiente seguro." }, 503);
    const auth = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = auth ? await verifySession(auth) : null;
    if (!session?.sub) return json({ error: "Sessão inválida" }, 401);
    if (isGroupAdsBrainSession(session)) return json({ error: "Sessões de grupo não podem acessar o Ads Brain." }, 403);
    const { data: collaborator } = await supabase.from("maestro_collaborators").select("id,is_active,profile").eq("id", session.sub).maybeSingle();
    if (!collaborator?.is_active) return json({ error: "Sessão inválida" }, 401);
    let membershipsQuery = supabase.from("organization_members")
      .select("organization_id,role,status,organizations!inner(status)")
      .eq("collaborator_id", collaborator.id)
      .eq("status", "active")
      .eq("organizations.status", "active")
      .order("created_at", { ascending: true })
      .limit(2);
    if (typeof session.organization_id === "string" && session.organization_id) {
      membershipsQuery = membershipsQuery.eq("organization_id", session.organization_id);
    }
    const { data: memberships, error: membershipError } = await membershipsQuery;
    if (membershipError) throw membershipError;
    const membershipChoice = selectOrganizationMembership(memberships, session.organization_id);
    if (!membershipChoice.ok) return json({ error: "Selecione uma única organização ativa antes de usar o Ads Brain." }, 403);
    const membership = membershipChoice.membership;
    const organizationId = membership.organization_id;
    const { data: adsProducts, error: productsError } = await supabase.from("organization_products")
      .select("product_key,status,expires_at")
      .eq("organization_id", organizationId)
      .in("product_key", ["maestro", "ads_brain"]);
    if (productsError) throw productsError;
    if (!hasActiveOrganizationProduct(adsProducts, "maestro") && !hasActiveOrganizationProduct(adsProducts, "ads_brain")) {
      return json({ error: "O produto Ads Brain não está habilitado para esta organização." }, 403);
    }
    const authorizedProfile = profileForOrganizationRole(
      (collaborator.profile || {}) as Record<string, unknown>,
      membership.organization_role,
    );
    if (!hasAdsBrainAccess(authorizedProfile)) {
      return json({ error: "A aba Ads Brain não está habilitada para este usuário." }, 403);
    }
    const body = await request.json();
    if (requiresAdsBrainManager(body.action) && !canManageAdsBrain(authorizedProfile)) {
      return json({ error: "Apenas Master ou Gestor pode gerenciar contas e campanhas no Ads Brain." }, 403);
    }
    if (body.action === "campaign_accounts") {
      const { data, error } = await supabase.from("maestro_ads_accounts")
        .select("id,external_account_id,external_account_name,client_name,display_name,network,currency,campaigns_data,last_synced_at")
        .eq("network", "Meta Ads").eq("organization_id", organizationId)
        .order("client_name", { ascending: true });
      if (error) throw error;
      return json({ accounts: data || [] });
    }
    if (["campaign_create", "campaign_update", "campaign_set_status"].includes(String(body.action || ""))) {
      requireCampaignConfirmation(body);
      const suppliedAccountId = String(body.account_id || "").trim();
      const isInternalAccountId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedAccountId);
      const requestedExternalAccountId = normalizeAdAccountId(suppliedAccountId);
      if (!isInternalAccountId && !requestedExternalAccountId) return json({ error: "Informe um ID válido da conta Meta Ads vinculada." }, 400);
      let accountQuery = supabase.from("maestro_ads_accounts")
        .select("id,authorization_id,network,external_account_id,client_name,campaigns_data,metrics_data")
        .eq("network", "Meta Ads").eq("organization_id", organizationId);
      accountQuery = isInternalAccountId
        ? accountQuery.eq("id", suppliedAccountId)
        : accountQuery.in("external_account_id", [suppliedAccountId, requestedExternalAccountId, requestedExternalAccountId.replace(/^act_/, "")]);
      const { data: account, error: accountError } = await accountQuery.limit(2);
      if (accountError) throw accountError;
      if (!account?.length) return json({ error: "Conta não encontrada entre as contas Meta vinculadas ao Ads Brain." }, 404);
      if (account.length !== 1) return json({ error: "O identificador corresponde a mais de uma conta. Use o ID interno da conta do Ads Brain." }, 409);
      const savedAccount = account[0];
      const normalizedAccountId = normalizeAdAccountId(savedAccount.external_account_id);
      if (!normalizedAccountId || (!isInternalAccountId && normalizedAccountId !== requestedExternalAccountId)) {
        return json({ error: "O ID informado não corresponde à conta vinculada selecionada." }, 400);
      }
      if (!savedAccount.authorization_id) return json({ error: "A conta não possui autorização Meta vinculada. Reconecte a conta." }, 401);
      const { data: authorization, error: authorizationError } = await supabase.from("maestro_ads_authorizations")
        .select("access_token_encrypted,token_expires_at")
        .eq("id", savedAccount.authorization_id).eq("organization_id", organizationId)
        .maybeSingle();
      if (authorizationError) throw authorizationError;
      if (!authorization || (authorization.token_expires_at && new Date(authorization.token_expires_at).getTime() < Date.now())) {
        return json({ error: "A autorização Meta expirou ou não existe. Reconecte a conta incluindo a permissão ads_management." }, 401);
      }
      let accessToken: string;
      try {
        accessToken = await decryptSecret(authorization.access_token_encrypted);
      } catch {
        return json({ error: "Não foi possível abrir a autorização Meta. Reconecte a conta." }, 401);
      }
      const action = String(body.action);
      const campaignId = String(body.campaign_id || "").trim();
      let campaign: Record<string, unknown>;
      if (action === "campaign_create") {
        const name = String(body.name || "").trim();
        const objective = String(body.objective || "");
        if (!name || name.length > 255) return json({ error: "Informe um nome de campanha entre 1 e 255 caracteres." }, 400);
        if (!CAMPAIGN_OBJECTIVES.has(objective)) return json({ error: "Objetivo de campanha Meta inválido." }, 400);
        if (!isValidBudgetCents(body.daily_budget_cents)) return json({ error: "O orçamento diário deve ser um valor inteiro em centavos, de no mínimo 100." }, 400);
        const createParams = new URLSearchParams({
          name,
          objective,
          status: "PAUSED",
          daily_budget: String(body.daily_budget_cents),
          special_ad_categories: "[]",
        });
        const created = await metaCampaignRequest(accessToken, `${normalizedAccountId}/campaigns`, createParams);
        campaign = await metaCampaignRequest(accessToken, `${String(created.id)}?fields=id,name,objective,status,effective_status,daily_budget,account_id,created_time,updated_time`);
      } else {
        if (!/^\d+$/.test(campaignId)) return json({ error: "Informe um ID de campanha Meta válido." }, 400);
        const existing = await metaCampaignRequest(accessToken, `${campaignId}?fields=id,name,status,daily_budget,account_id`);
        const ownerAccountId = normalizeAdAccountId(existing.account_id);
        if (String(existing.id) !== campaignId || ownerAccountId !== normalizedAccountId) {
          return json({ error: "A campanha não pertence à conta Meta selecionada." }, 409);
        }
        if (action === "campaign_update") {
          const params = campaignUpdateParams(body);
          const updated = await metaCampaignRequest(accessToken, campaignId, params);
          if (updated.success !== true) throw new SafeCampaignError("A Meta não confirmou a edição da campanha.", 502);
        } else {
          const status = String(body.status || "");
          if (!["ACTIVE", "PAUSED"].includes(status)) return json({ error: "Status de campanha inválido." }, 400);
          if (status === "ACTIVE" && body.confirm_activation !== true) {
            return json({ error: "Ativar exige confirmação explícita para ativar esta campanha." }, 400);
          }
          const updated = await metaCampaignRequest(accessToken, campaignId, new URLSearchParams({ status }));
          if (updated.success !== true) throw new SafeCampaignError("A Meta não confirmou a alteração de status.", 502);
        }
        campaign = await metaCampaignRequest(accessToken, `${campaignId}?fields=id,name,objective,status,effective_status,daily_budget,account_id,created_time,updated_time`);
      }
      if (String(campaign.account_id ? normalizeAdAccountId(campaign.account_id) : normalizedAccountId) !== normalizedAccountId) {
        throw new SafeCampaignError("A Meta devolveu uma campanha vinculada a outra conta; verificação interrompida.", 502);
      }
      if (action === "campaign_create" && campaign.status !== "PAUSED") {
        throw new SafeCampaignError("A campanha foi criada, mas a Meta não confirmou o estado pausado. Verifique a conta antes de qualquer outra ação.", 502);
      }
      if (action === "campaign_set_status" && campaign.status !== body.status) {
        throw new SafeCampaignError("A Meta não confirmou o status solicitado; verifique a campanha na plataforma.", 502);
      }
      if (action === "campaign_update") {
        if (body.name !== undefined && campaign.name !== String(body.name).trim()) throw new SafeCampaignError("A Meta não confirmou o nome solicitado; verifique a campanha na plataforma.", 502);
        if (body.daily_budget_cents !== undefined && String(campaign.daily_budget) !== String(body.daily_budget_cents)) throw new SafeCampaignError("A Meta não confirmou o orçamento solicitado; verifique a campanha na plataforma.", 502);
      }
      const changedAt = new Date().toISOString();
      const previousCampaigns = Array.isArray(savedAccount.campaigns_data) ? savedAccount.campaigns_data : [];
      const campaignIdResult = String(campaign.id || campaignId);
      const updatedCampaigns = previousCampaigns.filter((item: Record<string, unknown>) => String(item.id) !== campaignIdResult);
      const previousCampaign = previousCampaigns.find((item: Record<string, unknown>) => String(item.id) === campaignIdResult) as Record<string, unknown> | undefined;
      updatedCampaigns.unshift({ ...(previousCampaign || {}), ...campaign });
      const previousHistory = Array.isArray(savedAccount.metrics_data?.campaign_change_history) ? savedAccount.metrics_data.campaign_change_history : [];
      const prior = previousCampaign;
      const historyChanges = action === "campaign_create"
        ? [{ field: "created", label: "Campanha criada via Dominus", from: null, to: campaign.name }]
        : action === "campaign_set_status"
          ? [{ field: "status", label: "Status", from: prior?.status ?? null, to: campaign.status }]
          : ["name", "daily_budget"].flatMap((field) => {
            const requestedField = field === "daily_budget" ? "daily_budget_cents" : field;
            if (body[requestedField] === undefined) return [];
            const nextValue = field === "daily_budget" ? campaign.daily_budget : campaign.name;
            return [{ field, label: field === "name" ? "Nome" : "Orçamento diário", from: prior?.[field] ?? null, to: nextValue }];
          });
      const historyEvent = {
        id: `dominus-${campaignIdResult}-${changedAt}`,
        campaign_id: campaignIdResult,
        campaign_name: String(campaign.name || "Campanha"),
        changed_at: changedAt,
        type: action === "campaign_create" ? "created" : "updated",
        source: "dominus",
        summary: `Operação solicitada por ${collaborator.id}`,
        changes: historyChanges,
      };
      const metricsData = { ...((savedAccount.metrics_data || {}) as Record<string, unknown>), campaign_change_history: [...previousHistory, historyEvent].slice(-100) };
      const { error: cacheError } = await supabase.from("maestro_ads_accounts")
        .update({ campaigns_data: updatedCampaigns, metrics_data: metricsData, last_synced_at: changedAt, updated_at: changedAt })
        .eq("id", savedAccount.id).eq("organization_id", organizationId);
      if (cacheError) console.error("Meta campaign cache update failed", cacheError);
      return json({ campaign, account_id: savedAccount.id, verified: true });
    }
    if (body.action === "list") {
      const { data, error } = await supabase.from("maestro_ads_accounts")
        .select("id,authorization_id,network,external_account_id,external_account_name,client_name,display_name,currency,account_status,balance,minimum_balance,spending_limit,amount_spent,metrics_config,metrics_data,campaigns_data,last_synced_at,created_at,updated_at")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return json({ accounts: data || [] });
    }
    if (body.action === "remove") {
      const accountId = String(body.account_id || "");
      if (!accountId) return json({ error: "Selecione uma conta para remover." }, 400);
      const { data: account, error: accountError } = await supabase.from("maestro_ads_accounts")
        .select("id,external_account_name,network,external_account_id")
        .eq("id", accountId).eq("organization_id", organizationId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return json({ error: "Conta não encontrada no Ads Brain." }, 404);
      const { error } = await supabase.from("maestro_ads_accounts").delete().eq("id", accountId).eq("organization_id", organizationId);
      if (error) throw error;
      return json({ removed: true, account });
    }
    if (body.action === "save") {
      const clientName = String(body.client_name || "").trim();
      const account = body.account || {};
      const authorizationId = String(body.authorization_id || "");
      if (!clientName) return json({ error: "Informe o nome do cliente antes de salvar." }, 400);
      if (!authorizationId || !account.id || !account.name) return json({ error: "Selecione novamente a conta de anúncios." }, 400);
      const { data: authorization } = await supabase.from("maestro_ads_authorizations")
        .select("id,network,expires_at").eq("id", authorizationId).eq("collaborator_id", collaborator.id).eq("organization_id", organizationId).maybeSingle();
      if (!authorization || new Date(authorization.expires_at).getTime() < Date.now()) return json({ error: "A autorização expirou. Conecte a Meta novamente." }, 401);
      const network = authorization.network;
      const displayName = `${clientName} - ${network}`;
      const metrics = Array.isArray(body.metrics) ? body.metrics.slice(0, 10) : [];
      const externalAccountId = String(account.id);
      const accountPayload = {
        authorization_id: authorization.id,
        network,
        external_account_id: externalAccountId,
        external_account_name: String(account.name),
        client_name: clientName,
        display_name: displayName,
        currency: account.currency ? String(account.currency) : null,
        account_status: Number.isFinite(Number(account.account_status)) ? Number(account.account_status) : null,
        minimum_balance: body.minimum_balance === "" || body.minimum_balance == null ? null : Math.max(0, Number(body.minimum_balance) || 0),
        spending_limit: body.spending_limit === "" || body.spending_limit == null ? null : Math.max(0, Number(body.spending_limit) || 0),
        metrics_config: metrics,
        updated_at: new Date().toISOString(),
      };
      const { data: existingAccount, error: existingAccountError } = await supabase.from("maestro_ads_accounts")
        .select("id").eq("network", network).eq("external_account_id", externalAccountId).eq("organization_id", organizationId).maybeSingle();
      if (existingAccountError) throw existingAccountError;
      if (existingAccount) return json({ error: "Esta conta de anúncios já está ativa no Ads Brain. Remova o vínculo existente antes de cadastrá-la novamente.", code: "ACCOUNT_ALREADY_ACTIVE", account_id: existingAccount.id }, 409);
      const { data, error } = await supabase.from("maestro_ads_accounts").insert({ organization_id: organizationId, collaborator_id: collaborator.id, ...accountPayload }).select().single();
      if (error) throw error;
      return json({ account: data });
    }
    if (body.action === "competitor_report") {
      const clientId = String(body.client_id || "").trim();
      const since = /^\d{4}-\d{2}-\d{2}$/.test(String(body.since || "")) ? String(body.since) : "";
      const until = /^\d{4}-\d{2}-\d{2}$/.test(String(body.until || "")) ? String(body.until) : "";
      if (!clientId || !since || !until || since > until) return json({ error: "Informe cliente e intervalo válidos para a comparação." }, 400);
      const context = await loadCompetitiveContext(clientId, organizationId);
      if (!context) return json({ error: "Cliente não encontrado." }, 404);
      if (!context.instagramAccountId) return json({ error: "Cadastre o Instagram oficial do cliente antes de consultar a comparação." }, 400);
      if (!context.competitors.length) return json({ error: "Cadastre ao menos um perfil concorrente no bloco de Comparação competitiva." }, 400);
      const accessToken = await loadMetaAccessForClient(context, organizationId);
      if (!accessToken) return json({ error: "A conta Meta do cliente não possui uma autorização oficial válida para Business Discovery. Reconecte a conta com a permissão do Instagram." }, 403);
      return json({ report: await buildCompetitiveReport(accessToken, context, { since, until }) });
    }
    if (body.action === "report") {
      const since = /^\d{4}-\d{2}-\d{2}$/.test(String(body.since || "")) ? String(body.since) : "";
      const until = /^\d{4}-\d{2}-\d{2}$/.test(String(body.until || "")) ? String(body.until) : "";
      if (!since || !until || since > until) return json({ error: "Informe um intervalo válido para o relatório." }, 400);
      const previous = previousPeriod(since, until);
      const requestedIds = Array.isArray(body.account_ids) ? body.account_ids.map(String).filter(Boolean) : [];
      let accountsQuery = supabase.from("maestro_ads_accounts")
        .select("id,authorization_id,network,external_account_id,external_account_name,client_name,display_name,currency,last_synced_at")
        .eq("organization_id", organizationId)
        .order("client_name", { ascending: true });
      if (requestedIds.length) accountsQuery = accountsQuery.in("id", requestedIds);
      const { data: savedAccounts, error: savedAccountsError } = await accountsQuery;
      if (savedAccountsError) throw savedAccountsError;

      const reports = [];
      for (const savedAccount of savedAccounts || []) {
        const base = {
          id: savedAccount.id,
          client_name: savedAccount.client_name || savedAccount.display_name || "Cliente não identificado",
          network: savedAccount.network,
          currency: savedAccount.currency || "BRL",
          last_synced_at: savedAccount.last_synced_at,
        };
        if (savedAccount.network !== "Meta Ads") {
          reports.push({ ...base, status: "unsupported", error: "Esta rede ainda não possui conexão oficial configurada no Ads Brain." });
          continue;
        }
        if (!savedAccount.authorization_id) {
          reports.push({ ...base, status: "error", error: "Conta sem autorização oficial vinculada." });
          continue;
        }
        const { data: authorization } = await supabase.from("maestro_ads_authorizations")
          .select("access_token_encrypted,token_expires_at")
          .eq("id", savedAccount.authorization_id).eq("organization_id", organizationId)
          .maybeSingle();
        if (!authorization) {
          reports.push({ ...base, status: "error", error: "Autorização oficial não encontrada." });
          continue;
        }
        if (authorization.token_expires_at && new Date(authorization.token_expires_at).getTime() < Date.now()) {
          reports.push({ ...base, status: "error", error: "Autorização Meta expirada. Reconecte a conta." });
          continue;
        }
        try {
          const accessToken = await decryptSecret(authorization.access_token_encrypted);
          const accountId = savedAccount.external_account_id.startsWith("act_")
            ? savedAccount.external_account_id
            : `act_${savedAccount.external_account_id}`;
          const [current, previousMetrics] = await Promise.all([
            fetchReportMetrics(accessToken, accountId, { since, until }),
            fetchReportMetrics(accessToken, accountId, previous),
          ]);
          let competitive = null;
          try {
            const context = await loadCompetitiveContext("", organizationId, base.client_name);
            if (context?.instagramAccountId && context.competitors.length) {
              competitive = await buildCompetitiveReport(accessToken, context, { since, until });
            }
          } catch (competitiveError) {
            competitive = {
              client_id: null,
              client_name: base.client_name,
              status: "error",
              error: competitiveError instanceof Error ? competitiveError.message : "Falha na comparação competitiva.",
            };
          }
          reports.push({ ...base, status: "ok", current, previous: previousMetrics, competitive });
        } catch (error) {
          reports.push({ ...base, status: "error", error: error instanceof Error ? error.message : "Falha ao consultar a Meta." });
        }
      }
      return json({
        reports,
        requested_period: { since, until },
        previous_period: previous,
        source: "Meta Graph API v24.0",
        generated_at: new Date().toISOString(),
      });
    }
    if (body.action === "sync") {
      const syncSource = body.source === "automatic" ? "automatic" : "manual";
      const datePresetByPeriod: Record<string, string> = {
        "Hoje": "today",
        "Ontem": "yesterday",
        "Hoje e ontem": "today_and_yesterday",
        "Últimos 7 dias": "last_7d",
        "Últimos 14 dias": "last_14d",
        "Últimos 28 dias": "last_28d",
        "Últimos 30 dias": "last_30d",
        "Esta semana": "this_week_mon_today",
        "Semana passada": "last_week_mon_sun",
        "Este mês": "this_month",
        "Mês passado": "last_month",
        "Máximo": "maximum",
      };
      const requestedPeriod = String(body.period || "");
      const datePreset = datePresetByPeriod[requestedPeriod] || "last_7d";
      const customSince = /^\d{4}-\d{2}-\d{2}$/.test(String(body.since || "")) ? String(body.since) : "";
      const customUntil = /^\d{4}-\d{2}-\d{2}$/.test(String(body.until || "")) ? String(body.until) : "";
      const customRange = requestedPeriod === "Personalizado" && customSince && customUntil && customSince <= customUntil
        ? { since: customSince, until: customUntil }
        : null;
      if (requestedPeriod === "Personalizado" && !customRange) return json({ error: "Informe um período personalizado válido." }, 400);
      const insightsPeriod = customRange
        ? `time_range=${encodeURIComponent(JSON.stringify(customRange))}`
        : `date_preset=${encodeURIComponent(datePreset)}`;
      const campaignInsightsPeriod = customRange
        ? `time_range(${JSON.stringify(customRange)})`
        : `date_preset(${datePreset})`;
      const budgetCampaignInsightsPeriod = "date_preset(this_month)";
      const activityFields = "id,object_id,object_name,event_type,translated_event_type,event_time,actor_id,actor_name,extra_data";
      const { data: savedAccounts, error: savedAccountsError } = await supabase.from("maestro_ads_accounts")
        .select("id,authorization_id,external_account_id,network,metrics_data,campaigns_data").eq("organization_id", organizationId);
      if (savedAccountsError) throw savedAccountsError;
      const results = [];
      for (const savedAccount of savedAccounts || []) {
        if (savedAccount.network !== "Meta Ads" || !savedAccount.authorization_id) continue;
        const { data: authorization } = await supabase.from("maestro_ads_authorizations")
          .select("access_token_encrypted,token_expires_at").eq("id", savedAccount.authorization_id).eq("organization_id", organizationId).maybeSingle();
        if (!authorization) continue;
        if (authorization.token_expires_at && new Date(authorization.token_expires_at).getTime() < Date.now()) {
          results.push({ id: savedAccount.id, error: "Autorização Meta expirada" });
          continue;
        }
        const accessToken = await decryptSecret(authorization.access_token_encrypted);
        const accountId = savedAccount.external_account_id.startsWith("act_") ? savedAccount.external_account_id : `act_${savedAccount.external_account_id}`;
        const accountFields = "name,currency,account_status,balance,amount_spent";
        const insightFields = META_INSIGHT_FIELDS;
        const campaignFields = "id,name,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time";
        const [accountResponse, fundingResponse, insightsResponse, monthlyInsightsResponse, campaignsResponse, budgetCampaignsResponse, activitiesResponse] = await Promise.all([
          fetch(`https://graph.facebook.com/v24.0/${accountId}?fields=${accountFields}&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}?fields=funding_source_details,is_prepay_account&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/insights?${insightsPeriod}&fields=${insightFields}&limit=1&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/insights?date_preset=this_month&fields=spend&limit=1&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/campaigns?fields=${campaignFields},insights.${campaignInsightsPeriod}{${insightFields}}&limit=500&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/campaigns?fields=${campaignFields},insights.${budgetCampaignInsightsPeriod}{${insightFields}}&limit=500&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/activities?fields=${activityFields}&limit=500&access_token=${encodeURIComponent(accessToken)}`),
        ]);
        const [accountData, fundingData, insightsPayload, monthlyInsightsPayload, campaignsPayload, budgetCampaignsPayload, activitiesPayload] = await Promise.all([accountResponse.json(), fundingResponse.json(), insightsResponse.json(), monthlyInsightsResponse.json(), campaignsResponse.json(), budgetCampaignsResponse.json(), activitiesResponse.json()]);
        if (accountData.error || insightsPayload.error || campaignsPayload.error) {
          results.push({ id: savedAccount.id, error: accountData.error?.message || insightsPayload.error?.message || campaignsPayload.error?.message || "Falha na Meta" });
          continue;
        }
        const insight = insightsPayload.data?.[0] || {};
        const actions = Object.fromEntries((insight.actions || []).map((item: { action_type: string; value: string }) => [item.action_type, Number(item.value)]));
        const isPrepayAccount = fundingData?.is_prepay_account === true;
        const fundingSourceDisplay = fundingData?.funding_source_details?.display_string ?? null;
        const prepaidBalance = isPrepayAccount ? parseFundingSourceAmount(fundingSourceDisplay) : null;
        const currentMonth = new Date().toISOString().slice(0, 7);
        const previousMonthlySpend = Number(savedAccount.metrics_data?.billing_sync?.monthly_spend);
        const previousMonthlySpendMonth = savedAccount.metrics_data?.billing_sync?.monthly_spend_month;
        const hasMonthlyInsightData = Array.isArray(monthlyInsightsPayload?.data);
        const monthlySpend = monthlyInsightsPayload?.error
          ? (previousMonthlySpendMonth === currentMonth && Number.isFinite(previousMonthlySpend) ? previousMonthlySpend : null)
          : hasMonthlyInsightData
            ? (Number.isFinite(Number(monthlyInsightsPayload.data?.[0]?.spend)) ? Number(monthlyInsightsPayload.data?.[0]?.spend) : 0)
            : null;
        const billingSync = {
          is_prepay_account: fundingData?.is_prepay_account ?? null,
          payment_method: isPrepayAccount ? "prepaid" : (fundingData?.funding_source_details ? "credit_card" : "postpaid"),
          available_funds_api_supported: isPrepayAccount ? prepaidBalance != null : accountData.balance != null,
          balance_source: isPrepayAccount ? (prepaidBalance != null ? "meta_funding_source_details_display_string" : null) : (accountData.balance != null ? "meta_ad_account_amount_due" : null),
          prepaid_balance: prepaidBalance,
          monthly_spend: Number.isFinite(monthlySpend) ? monthlySpend : null,
          monthly_spend_month: Number.isFinite(monthlySpend) ? currentMonth : null,
          monthly_spend_error: monthlyInsightsPayload?.error?.message || null,
          funding_source_display: fundingSourceDisplay,
          funding_error: fundingData?.error?.message || null,
          funding_source_type: fundingData?.funding_source_details?.type ?? null,
        };
        const messagingConversationsStarted = actionTotal(insight.actions, isMessagingConversationStarted);
        const syncedAt = new Date().toISOString();
        const campaigns = campaignsPayload.data || [];
        const budgetCampaigns = Array.isArray(budgetCampaignsPayload?.data)
          ? budgetCampaignsPayload.data
          : (Array.isArray(savedAccount.metrics_data?.budget_campaigns_data) ? savedAccount.metrics_data.budget_campaigns_data : campaigns);
        const existingHistory = Array.isArray(savedAccount.metrics_data?.campaign_change_history) ? savedAccount.metrics_data.campaign_change_history : [];
        const campaignHistory = Array.from(new Map([
          ...existingHistory,
          ...campaignChangeEvents(savedAccount.campaigns_data, campaigns, syncedAt),
          ...metaCampaignActivityEvents(activitiesPayload, campaigns, syncedAt),
        ].map((event) => [String(event.id || `${event.campaign_id}-${event.changed_at}`), event])).values()).slice(-100);
        const metricsData = {
          ...insight,
          sync_source: syncSource,
          sync_completed_at: syncedAt,
          report_period: requestedPeriod || "Últimos 7 dias",
          actions,
          actions_raw: insight.actions || [],
          action_values_raw: insight.action_values || [],
          messaging_conversations_started: messagingConversationsStarted,
          cost_per_messaging_conversation_started: resolveMessagingCost(insight),
          ads_brain_risk_alert: savedAccount.metrics_data?.ads_brain_risk_alert === true,
          ads_brain_card_pinned: savedAccount.metrics_data?.ads_brain_card_pinned === true,
          ads_brain_card_order: savedAccount.metrics_data?.ads_brain_card_order ?? null,
          advanced_metrics: Array.isArray(savedAccount.metrics_data?.advanced_metrics) ? savedAccount.metrics_data.advanced_metrics : [],
          budget_divisions: Array.isArray(savedAccount.metrics_data?.budget_divisions) ? savedAccount.metrics_data.budget_divisions : [],
          budget_reference_month: savedAccount.metrics_data?.budget_reference_month ?? null,
          budget_days_remaining: savedAccount.metrics_data?.budget_days_remaining ?? null,
          monthly_investment_goal: savedAccount.metrics_data?.monthly_investment_goal ?? null,
          budget_campaigns_data: budgetCampaigns,
          budget_campaigns_error: budgetCampaignsPayload?.error?.message || null,
          billing_sync: billingSync,
          campaign_change_history: campaignHistory,
        };
        const update = {
          external_account_name: accountData.name || undefined,
          currency: accountData.currency || undefined,
          account_status: accountData.account_status ?? undefined,
          amount_spent: accountData.amount_spent != null ? Number(accountData.amount_spent) / 100 : null,
          metrics_data: metricsData,
          campaigns_data: campaigns,
          last_synced_at: syncedAt,
          updated_at: syncedAt,
          ...(isPrepayAccount
            ? (prepaidBalance != null ? { balance: prepaidBalance } : {})
            : { balance: accountData.balance != null ? Number(accountData.balance) / 100 : null }),
        };
        const { data: updated, error: updateError } = await supabase.from("maestro_ads_accounts").update(update).eq("id", savedAccount.id).eq("organization_id", organizationId).select().single();
        if (updateError) throw updateError;
        results.push({ id: savedAccount.id, account: updated });
      }
      return json({ results, synced: results.filter((item) => item.account).length });
    }
    if (body.action === "update_metrics" || body.action === "update_account") {
      const metrics = Array.isArray(body.metrics) ? body.metrics.slice(0, 10) : [];
      const isAccountUpdate = body.action === "update_account";
      const clientName = String(body.client_name || "").trim().slice(0, 120);
      if (isAccountUpdate && !clientName) return json({ error: "Informe o nome do cliente." }, 400);
      const { data: currentAccount, error: currentAccountError } = await supabase.from("maestro_ads_accounts")
        .select("network,metrics_data").eq("id", String(body.account_id || "")).eq("organization_id", organizationId).maybeSingle();
      if (currentAccountError) throw currentAccountError;
      if (!currentAccount) return json({ error: "Conta não encontrada." }, 404);
      const { data, error } = await supabase.from("maestro_ads_accounts")
        .update({
          ...(isAccountUpdate ? { client_name: clientName, display_name: `${clientName} - ${currentAccount.network}` } : {}),
          metrics_config: metrics,
          minimum_balance: body.minimum_balance === "" || body.minimum_balance == null ? null : Math.max(0, Number(body.minimum_balance) || 0),
          spending_limit: body.spending_limit === "" || body.spending_limit == null ? null : Math.max(0, Number(body.spending_limit) || 0),
          ...(isAccountUpdate ? {
            metrics_data: {
              ...((currentAccount.metrics_data || {}) as Record<string, unknown>),
              ads_brain_risk_alert: body.risk_alert === true,
              advanced_metrics: Array.isArray(body.advanced_metrics) ? body.advanced_metrics.slice(0, 20) : [],
              budget_divisions: Array.isArray(body.budget_divisions) ? body.budget_divisions.slice(0, 30) : [],
              budget_reference_month: body.budget_reference_month ? String(body.budget_reference_month).slice(0, 7) : null,
              budget_days_remaining: body.budget_days_remaining === "" || body.budget_days_remaining == null
                ? null
                : Math.max(0, Number(body.budget_days_remaining) || 0),
              monthly_investment_goal: body.monthly_investment_goal === "" || body.monthly_investment_goal == null
                ? null
                : Math.max(0, Number(body.monthly_investment_goal) || 0),
            },
          } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(body.account_id || "")).eq("organization_id", organizationId)
        .select().maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Conta não encontrada." }, 404);
      return json({ account: data });
    }
    if (body.action === "update_card_organization") {
      const accountId = String(body.account_id || "");
      const { data: currentAccount, error: currentAccountError } = await supabase.from("maestro_ads_accounts")
        .select("metrics_data").eq("id", accountId).eq("organization_id", organizationId).maybeSingle();
      if (currentAccountError) throw currentAccountError;
      if (!currentAccount) return json({ error: "Conta não encontrada." }, 404);
      const cardOrder = body.card_order == null || body.card_order === ""
        ? null
        : Math.max(0, Number(body.card_order) || 0);
      const { data, error } = await supabase.from("maestro_ads_accounts")
        .update({
          metrics_data: {
            ...((currentAccount.metrics_data || {}) as Record<string, unknown>),
            ads_brain_card_pinned: body.card_pinned === true,
            ads_brain_card_order: cardOrder,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId).eq("organization_id", organizationId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Conta não encontrada." }, 404);
      return json({ account: data });
    }
    if (body.action === "start") {
      const nonce = createMetaOAuthNonce();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { error: cleanupError } = await supabase.from("maestro_meta_oauth_states").delete().lt("expires_at", new Date().toISOString());
      if (cleanupError) throw cleanupError;
      const { error: stateError } = await supabase.from("maestro_meta_oauth_states").insert({
        nonce_hash: await hashMetaOAuthNonce(nonce),
        collaborator_id: collaborator.id,
        organization_id: organizationId,
        expires_at: expiresAt,
      });
      if (stateError) throw stateError;
      const state = await sign(JSON.stringify({ sub: collaborator.id, organization_id: organizationId, nonce, exp: Math.floor(Date.parse(expiresAt) / 1000) }));
      const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: "code", scope: "ads_read,ads_management,business_management,instagram_basic,pages_show_list,pages_read_engagement" });
      return json({ authorization_url: `https://www.facebook.com/v24.0/dialog/oauth?${params}` });
    }
    if (body.action !== "complete" || !body.code) return json({ error: "Código OAuth inválido ou expirado" }, 400);
    const oauthState = await verify(String(body.state || ""));
    if (!isMetaOAuthStateBound(oauthState, collaborator.id, organizationId)) return json({ error: "Código OAuth inválido ou expirado" }, 400);
    const { data: consumedState, error: consumeStateError } = await supabase.from("maestro_meta_oauth_states")
      .delete()
      .eq("nonce_hash", await hashMetaOAuthNonce(String(oauthState.nonce)))
      .eq("collaborator_id", collaborator.id)
      .eq("organization_id", organizationId)
      .gt("expires_at", new Date().toISOString())
      .select("nonce_hash")
      .maybeSingle();
    if (consumeStateError) throw consumeStateError;
    if (!consumedState) return json({ error: "Código OAuth inválido, expirado ou já utilizado" }, 400);
    const tokenResponse = await fetch("https://graph.facebook.com/v24.0/oauth/access_token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code: String(body.code) }) });
    const token = await tokenResponse.json();
    if (!token.access_token) {
      const metaMessage = token.error?.error_user_msg || token.error?.message;
      return json({ error: metaMessage ? `A Meta recusou a conexão: ${metaMessage}` : "A Meta não autorizou a conexão" }, 502);
    }
    const accountsResponse = await fetch(`https://graph.facebook.com/v24.0/me/adaccounts?fields=id,name,account_status,currency&limit=200&access_token=${encodeURIComponent(token.access_token)}`);
    const accounts = await accountsResponse.json();
    if (accounts.error) {
      const metaMessage = accounts.error.error_user_msg || accounts.error.message;
      return json({ error: metaMessage ? `A Meta recusou a consulta das contas: ${metaMessage}` : "Não foi possível consultar as contas de anúncios" }, 502);
    }
    const tokenExpiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null;
    const { data: authorization, error: authorizationError } = await supabase.from("maestro_ads_authorizations").insert({
      organization_id: organizationId,
      collaborator_id: collaborator.id,
      network: "Meta Ads",
      access_token_encrypted: await encryptSecret(token.access_token),
      token_expires_at: tokenExpiresAt,
    }).select("id").single();
    if (authorizationError) throw authorizationError;
    return json({ accounts: accounts.data || [], authorization_id: authorization.id, expires_at: tokenExpiresAt });
  } catch (error) {
    console.error("Meta Ads OAuth error", error);
    if (error instanceof SafeCampaignError) return json({ error: error.message }, error.status);
    return json({ error: "Erro ao conectar com a Meta" }, 500);
  }
});
