import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCompetitiveReport } from "./competitiveMetrics.ts";
import { buildAdsBrainCorsHeaders } from "../_shared/meta-ads-cors.js";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const appId = Deno.env.get("META_APP_ID") || "";
const appSecret = Deno.env.get("META_APP_SECRET") || "";
const redirectUri = Deno.env.get("META_OAUTH_REDIRECT_URI") || "https://dominiomaestro.com.br/AdsBrain";

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
  const state = JSON.parse(decode(body));
  return state.exp > Math.floor(Date.now() / 1000) ? state : null;
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
const corsHeaders = buildAdsBrainCorsHeaders();
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

function normalizeReportMetrics(insight: Record<string, unknown> = {}) {
  return {
    spend: Number.isFinite(Number(insight.spend)) ? Number(insight.spend) : null,
    impressions: Number.isFinite(Number(insight.impressions)) ? Number(insight.impressions) : null,
    reach: Number.isFinite(Number(insight.reach)) ? Number(insight.reach) : null,
    clicks: Number.isFinite(Number(insight.clicks)) ? Number(insight.clicks) : null,
    ctr: Number.isFinite(Number(insight.ctr)) ? Number(insight.ctr) : null,
    cpc: Number.isFinite(Number(insight.cpc)) ? Number(insight.cpc) : null,
    cpm: Number.isFinite(Number(insight.cpm)) ? Number(insight.cpm) : null,
    frequency: Number.isFinite(Number(insight.frequency)) ? Number(insight.frequency) : null,
    leads: actionTotal(insight.actions, (type) => /(^|[._])lead(s)?($|[._])|lead/i.test(type)),
    purchases: actionTotal(insight.actions, (type) => /purchase/i.test(type)),
    messages: actionTotal(insight.actions, (type) => /messaging|message/i.test(type)),
  };
}

async function fetchReportMetrics(accessToken: string, accountId: string, range: { since: string; until: string }) {
  const query = new URLSearchParams({
    time_range: JSON.stringify(range),
    fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions",
    time_increment: "all_days",
    limit: "1",
    access_token: accessToken,
  });
  const response = await fetch(`https://graph.facebook.com/v24.0/${accountId}/insights?${query}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.error_user_msg || payload.error.message || "Falha ao consultar insights da Meta");
  return normalizeReportMetrics(payload.data?.[0] || {});
}

async function loadCompetitiveContext(clientId: string, clientName = "") {
  const clientQuery = supabase
    .from("legacy_records")
    .select("record_id,payload")
    .eq("entity", "Client");
  const { data: clientRows, error: clientError } = clientId
    ? await clientQuery.eq("record_id", clientId).limit(1)
    : await clientQuery.filter("payload->>name", "eq", clientName).limit(1);
  if (clientError) throw clientError;
  const clientRow = clientRows?.[0];
  if (!clientRow) return null;
  const resolvedClientId = String(clientRow.record_id || clientId || "");
  const resolvedClientName = String(clientRow.payload?.name || clientName || "Cliente não identificado");
  const [competitorRows, insightRows, postRows] = await Promise.all([
    supabase.from("legacy_records").select("record_id,payload").eq("entity", "ClientCompetitor").filter("payload->>client_id", "eq", resolvedClientId).limit(50),
    supabase.from("legacy_records").select("payload").eq("entity", "ClientInsight").filter("payload->>client_id", "eq", resolvedClientId).limit(200),
    supabase.from("legacy_records").select("payload").eq("entity", "PostMetric").filter("payload->>client_id", "eq", resolvedClientId).limit(200),
  ]);
  if (competitorRows.error) throw competitorRows.error;
  if (insightRows.error) throw insightRows.error;
  if (postRows.error) throw postRows.error;
  return {
    clientId: resolvedClientId,
    clientName: resolvedClientName,
    instagramAccountId: String(clientRow.payload?.instagram_account_id || ""),
    competitors: (competitorRows.data || []).map((row) => ({ id: row.record_id, ...(row.payload || {}) })),
    ownInsights: (insightRows.data || []).map((row) => row.payload || {}),
    ownPosts: (postRows.data || []).map((row) => row.payload || {}),
  };
}

async function loadMetaAccessForClient(context: { clientName: string }) {
  const { data: account, error: accountError } = await supabase
    .from("maestro_ads_accounts")
    .select("authorization_id")
    .eq("network", "Meta Ads")
    .eq("client_name", context.clientName)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account?.authorization_id) return null;
  const { data: authorization, error: authorizationError } = await supabase
    .from("maestro_ads_authorizations")
    .select("access_token_encrypted,token_expires_at")
    .eq("id", account.authorization_id)
    .maybeSingle();
  if (authorizationError) throw authorizationError;
  if (!authorization) return null;
  if (authorization.token_expires_at && new Date(authorization.token_expires_at).getTime() < Date.now()) return null;
  return decryptSecret(authorization.access_token_encrypted);
}

const handleMetaAdsRequest = async (request: Request) => {
  try {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);
    if (!sessionSecret || !appId || !appSecret) return json({ error: "Integração Meta ainda não configurada no ambiente seguro." }, 503);
    const auth = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = auth ? await verifySession(auth) : null;
    if (!session?.sub) return json({ error: "Sessão inválida" }, 401);
    const { data: collaborator } = await supabase.from("maestro_collaborators").select("id,is_active,profile").eq("id", session.sub).maybeSingle();
    if (!collaborator?.is_active) return json({ error: "Sessão inválida" }, 401);
    if (!hasAdsBrainAccess((collaborator.profile || {}) as Record<string, unknown>)) {
      return json({ error: "A aba Ads Brain não está habilitada para este usuário." }, 403);
    }
    const body = await request.json();
    if (body.action === "list") {
      const { data, error } = await supabase.from("maestro_ads_accounts")
        .select("id,authorization_id,network,external_account_id,external_account_name,client_name,display_name,currency,account_status,balance,minimum_balance,spending_limit,amount_spent,metrics_config,metrics_data,campaigns_data,last_synced_at,created_at,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return json({ accounts: data || [] });
    }
    if (body.action === "remove") {
      const accountId = String(body.account_id || "");
      if (!accountId) return json({ error: "Selecione uma conta para remover." }, 400);
      const { data: account, error: accountError } = await supabase.from("maestro_ads_accounts")
        .select("id,external_account_name,network,external_account_id")
        .eq("id", accountId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return json({ error: "Conta não encontrada no Ads Brain." }, 404);
      const { error } = await supabase.from("maestro_ads_accounts").delete().eq("id", accountId);
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
        .select("id,network,expires_at").eq("id", authorizationId).eq("collaborator_id", collaborator.id).maybeSingle();
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
        .select("id").eq("network", network).eq("external_account_id", externalAccountId).maybeSingle();
      if (existingAccountError) throw existingAccountError;
      if (existingAccount) return json({ error: "Esta conta de anúncios já está ativa no Ads Brain. Remova o vínculo existente antes de cadastrá-la novamente.", code: "ACCOUNT_ALREADY_ACTIVE", account_id: existingAccount.id }, 409);
      const { data, error } = await supabase.from("maestro_ads_accounts").insert({ collaborator_id: collaborator.id, ...accountPayload }).select().single();
      if (error) throw error;
      return json({ account: data });
    }
    if (body.action === "competitor_report") {
      const clientId = String(body.client_id || "").trim();
      const since = /^\d{4}-\d{2}-\d{2}$/.test(String(body.since || "")) ? String(body.since) : "";
      const until = /^\d{4}-\d{2}-\d{2}$/.test(String(body.until || "")) ? String(body.until) : "";
      if (!clientId || !since || !until || since > until) return json({ error: "Informe cliente e intervalo válidos para a comparação." }, 400);
      const context = await loadCompetitiveContext(clientId);
      if (!context) return json({ error: "Cliente não encontrado." }, 404);
      if (!context.instagramAccountId) return json({ error: "Cadastre o Instagram oficial do cliente antes de consultar a comparação." }, 400);
      if (!context.competitors.length) return json({ error: "Cadastre ao menos um perfil concorrente no bloco de Comparação competitiva." }, 400);
      const accessToken = await loadMetaAccessForClient(context);
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
          .eq("id", savedAccount.authorization_id)
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
            const context = await loadCompetitiveContext("", base.client_name);
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
      const { data: savedAccounts, error: savedAccountsError } = await supabase.from("maestro_ads_accounts")
        .select("id,authorization_id,external_account_id,network,metrics_data");
      if (savedAccountsError) throw savedAccountsError;
      const results = [];
      for (const savedAccount of savedAccounts || []) {
        if (savedAccount.network !== "Meta Ads" || !savedAccount.authorization_id) continue;
        const { data: authorization } = await supabase.from("maestro_ads_authorizations")
          .select("access_token_encrypted,token_expires_at").eq("id", savedAccount.authorization_id).maybeSingle();
        if (!authorization) continue;
        if (authorization.token_expires_at && new Date(authorization.token_expires_at).getTime() < Date.now()) {
          results.push({ id: savedAccount.id, error: "Autorização Meta expirada" });
          continue;
        }
        const accessToken = await decryptSecret(authorization.access_token_encrypted);
        const accountId = savedAccount.external_account_id.startsWith("act_") ? savedAccount.external_account_id : `act_${savedAccount.external_account_id}`;
        const accountFields = "name,currency,account_status,balance,amount_spent";
        const insightFields = "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,purchase_roas";
        const campaignFields = "id,name,status,effective_status,daily_budget,lifetime_budget";
        const [accountResponse, fundingResponse, insightsResponse, monthlyInsightsResponse, campaignsResponse] = await Promise.all([
          fetch(`https://graph.facebook.com/v24.0/${accountId}?fields=${accountFields}&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}?fields=funding_source_details,is_prepay_account&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/insights?${insightsPeriod}&fields=${insightFields}&limit=1&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/insights?date_preset=this_month&fields=spend&limit=1&access_token=${encodeURIComponent(accessToken)}`),
          fetch(`https://graph.facebook.com/v24.0/${accountId}/campaigns?filtering=${encodeURIComponent(JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]))}&fields=${campaignFields},insights.${campaignInsightsPeriod}{${insightFields}}&limit=100&access_token=${encodeURIComponent(accessToken)}`),
        ]);
        const [accountData, fundingData, insightsPayload, monthlyInsightsPayload, campaignsPayload] = await Promise.all([accountResponse.json(), fundingResponse.json(), insightsResponse.json(), monthlyInsightsResponse.json(), campaignsResponse.json()]);
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
        const metricsData = { ...insight, actions, actions_raw: insight.actions || [], action_values_raw: insight.action_values || [], billing_sync: billingSync };
        const update = {
          external_account_name: accountData.name || undefined,
          currency: accountData.currency || undefined,
          account_status: accountData.account_status ?? undefined,
          amount_spent: accountData.amount_spent != null ? Number(accountData.amount_spent) / 100 : null,
          metrics_data: metricsData,
          campaigns_data: campaignsPayload.data || [],
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...(isPrepayAccount
            ? (prepaidBalance != null ? { balance: prepaidBalance } : {})
            : { balance: accountData.balance != null ? Number(accountData.balance) / 100 : null }),
        };
        const { data: updated, error: updateError } = await supabase.from("maestro_ads_accounts").update(update).eq("id", savedAccount.id).select().single();
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
        .select("network").eq("id", String(body.account_id || "")).maybeSingle();
      if (currentAccountError) throw currentAccountError;
      if (!currentAccount) return json({ error: "Conta não encontrada." }, 404);
      const { data, error } = await supabase.from("maestro_ads_accounts")
        .update({
          ...(isAccountUpdate ? { client_name: clientName, display_name: `${clientName} - ${currentAccount.network}` } : {}),
          metrics_config: metrics,
          minimum_balance: body.minimum_balance === "" || body.minimum_balance == null ? null : Math.max(0, Number(body.minimum_balance) || 0),
          spending_limit: body.spending_limit === "" || body.spending_limit == null ? null : Math.max(0, Number(body.spending_limit) || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", String(body.account_id || ""))
        .select().maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Conta não encontrada." }, 404);
      return json({ account: data });
    }
    if (body.action === "start") {
      const state = await sign(JSON.stringify({ sub: collaborator.id, exp: Math.floor(Date.now() / 1000) + 600 }));
      const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: "code", scope: "ads_read,business_management,instagram_basic,pages_show_list,pages_read_engagement" });
      return json({ authorization_url: `https://www.facebook.com/v24.0/dialog/oauth?${params}` });
    }
    if (body.action !== "complete" || !body.code || !(await verify(String(body.state)))) return json({ error: "Código OAuth inválido ou expirado" }, 400);
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
      collaborator_id: collaborator.id,
      network: "Meta Ads",
      access_token_encrypted: await encryptSecret(token.access_token),
      token_expires_at: tokenExpiresAt,
    }).select("id").single();
    if (authorizationError) throw authorizationError;
    return json({ accounts: accounts.data || [], authorization_id: authorization.id, expires_at: tokenExpiresAt });
  } catch (error) { console.error("Meta Ads OAuth error", error); return json({ error: "Erro ao conectar com a Meta" }, 500); }
};

Deno.serve(async (request) => {
  const response = await handleMetaAdsRequest(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(buildAdsBrainCorsHeaders(request.headers.get("Origin") || ""))) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
