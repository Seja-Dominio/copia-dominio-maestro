import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { accessLevelForOrganizationRole, selectOrganizationMembership } from "../_shared/maestro-tenant.mjs";
import { hasActiveOrganizationProduct } from "../_shared/organization-products.mjs";

type Session = { sub: string; exp: number; access_level?: string; organization_id?: string };
type Collaborator = { id: string; name: string; access_level: string };

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";

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

function response(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
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

  let session: Session;
  try {
    session = JSON.parse(decode(body)) as Session;
  } catch {
    return null;
  }
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;

  const { data } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active, profile")
    .eq("id", session.sub)
    .maybeSingle();
  if (!data?.is_active) return null;

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
  const choice = selectOrganizationMembership(memberships, session.organization_id);
  if (!choice.ok) return null;
  const { data: products, error: productsError } = await supabase.from("organization_products")
    .select("product_key,status,expires_at")
    .eq("organization_id", choice.membership.organization_id)
    .eq("product_key", "maestro");
  if (productsError || !hasActiveOrganizationProduct(products, "maestro")) return null;
  return {
    ...session,
    organization_id: choice.membership.organization_id,
    access_level: accessLevelForOrganizationRole(choice.membership.organization_role),
  };
}

function collaboratorFromRow(row: any, organizationRole: string): Collaborator {
  const profile = row?.profile && typeof row.profile === "object" ? row.profile : {};
  const name = String(profile.name || profile.full_name || profile.login || row?.id || "Colaborador");
  return { id: String(row.id), name, access_level: accessLevelForOrganizationRole(organizationRole) };
}

async function loadCollaborators(organizationId: string, onlyIds?: string[]) {
  let membershipQuery = supabase
    .from("organization_members")
    .select("collaborator_id, role")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(500);
  if (onlyIds) membershipQuery = membershipQuery.in("collaborator_id", onlyIds);
  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) throw membershipError;
  const membershipByCollaborator = new Map((memberships || []).map((membership) => [String(membership.collaborator_id), String(membership.role)]));
  const collaboratorIds = [...membershipByCollaborator.keys()];
  if (!collaboratorIds.length) return [];
  const { data, error } = await supabase
    .from("maestro_collaborators")
    .select("id, profile")
    .eq("is_active", true)
    .in("id", collaboratorIds)
    .order("id");
  if (error) throw error;
  return (data || []).map((row) => collaboratorFromRow(row, membershipByCollaborator.get(String(row.id)) || "member"));
}

async function loadChannels(organizationId: string) {
  const { data, error } = await supabase
    .from("team_chat_channels")
    .select("id, slug, name, description, is_private, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .order("is_private", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function assertChannel(channelId: string, organizationId: string) {
  const { data, error } = await supabase
    .from("team_chat_channels")
    .select("id, slug, name, description, is_private, created_at, updated_at")
    .eq("id", channelId)
    .eq("organization_id", organizationId)
    .eq("is_archived", false)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Canal não encontrado ou arquivado.");
  if (data.is_private) throw new Error("Este canal privado ainda não está disponível.");
  return data;
}

async function loadMessages(channelId: string, organizationId: string) {
  await assertChannel(channelId, organizationId);
  const { data, error } = await supabase
    .from("team_chat_messages")
    .select("id, channel_id, author_id, content, reply_to_id, created_at, edited_at")
    .eq("channel_id", channelId)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  const rows = [...(data || [])].reverse();
  const authorIds = [...new Set(rows.map((row) => String(row.author_id)))];
  if (!authorIds.length) return [];
  const collaborators = await loadCollaborators(organizationId, authorIds);
  const authors = new Map(collaborators.map((row) => [String(row.id), row]));

  const messageIds = rows.map((row) => row.id);
  const { data: reactions, error: reactionsError } = await supabase
    .from("team_chat_message_reactions")
    .select("message_id, collaborator_id, emoji")
    .in("message_id", messageIds)
    .eq("organization_id", organizationId);
  if (reactionsError) throw reactionsError;

  const reactionMap = new Map<string, Array<{ emoji: string; count: number; reacted: boolean }>>();
  for (const reaction of reactions || []) {
    const list = reactionMap.get(String(reaction.message_id)) || [];
    const current = list.find((item) => item.emoji === reaction.emoji);
    if (current) current.count += 1;
    else list.push({ emoji: reaction.emoji, count: 1, reacted: false });
    reactionMap.set(String(reaction.message_id), list);
  }

  return rows.map((row) => ({
    ...row,
    author: authors.get(String(row.author_id)) || { id: row.author_id, name: "Colaborador", access_level: "collaborator" },
    reactions: reactionMap.get(String(row.id)) || [],
  }));
}

async function sendMessage(session: Session, body: Record<string, unknown>) {
  const channelId = String(body.channelId || "");
  const content = String(body.content || "").trim();
  if (!channelId) throw new Error("Selecione um canal.");
  if (!content) throw new Error("Escreva uma mensagem.");
  if (content.length > 4000) throw new Error("A mensagem deve ter no máximo 4.000 caracteres.");
  await assertChannel(channelId, String(session.organization_id || ""));

  const replyToId = body.replyToId ? String(body.replyToId) : null;
  const { data, error } = await supabase
    .from("team_chat_messages")
    .insert({ organization_id: session.organization_id, channel_id: channelId, author_id: session.sub, content, reply_to_id: replyToId })
    .select("id, channel_id, author_id, content, reply_to_id, created_at, edited_at")
    .single();
  if (error) throw error;
  const messages = await loadMessages(channelId, String(session.organization_id || ""));
  return messages.find((message) => message.id === data.id) || data;
}

async function toggleReaction(session: Session, body: Record<string, unknown>) {
  const messageId = String(body.messageId || "");
  const emoji = String(body.emoji || "").trim();
  if (!messageId || !emoji) throw new Error("Reação inválida.");
  if (emoji.length > 16) throw new Error("Reação inválida.");

  const { data: message, error: messageError } = await supabase
    .from("team_chat_messages")
    .select("id, channel_id")
    .eq("id", messageId)
    .eq("organization_id", session.organization_id || "")
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) throw new Error("Mensagem não encontrada.");
  await assertChannel(String(message.channel_id), String(session.organization_id || ""));

  const existing = await supabase
    .from("team_chat_message_reactions")
    .select("message_id")
    .eq("message_id", messageId)
    .eq("organization_id", session.organization_id || "")
    .eq("collaborator_id", session.sub)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await supabase
      .from("team_chat_message_reactions")
      .delete()
      .eq("message_id", messageId)
      .eq("organization_id", session.organization_id || "")
      .eq("collaborator_id", session.sub)
      .eq("emoji", emoji);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("team_chat_message_reactions")
      .insert({ organization_id: session.organization_id, message_id: messageId, collaborator_id: session.sub, emoji });
    if (error) throw error;
  }

  return { messages: await loadMessages(String(message.channel_id), String(session.organization_id || "")) };
}

async function handle(body: Record<string, unknown>, session: Session) {
  const action = String(body.action || "bootstrap");
  if (action === "bootstrap") {
    const organizationId = String(session.organization_id || "");
    const channels = await loadChannels(organizationId);
    const activeChannelId = String(body.channelId || channels.find((channel) => channel.slug === "geral")?.id || channels[0]?.id || "");
    return {
      channels,
      collaborators: await loadCollaborators(organizationId),
      messages: activeChannelId ? await loadMessages(activeChannelId, organizationId) : [],
      activeChannelId,
    };
  }
  if (action === "listMessages") {
    return { messages: await loadMessages(String(body.channelId || ""), String(session.organization_id || "")) };
  }
  if (action === "sendMessage") {
    return { message: await sendMessage(session, body) };
  }
  if (action === "toggleReaction") return toggleReaction(session, body);
  throw new Error("Ação de comunicação inválida.");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return response({ error: "Método não permitido" }, 405, origin);

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const session = await verifySession(token);
  if (!session) return response({ error: "Sessão inválida ou expirada" }, 401, origin);

  try {
    const body = await request.json();
    return response({ data: await handle(body, session) }, 200, origin);
  } catch (error) {
    console.error("team-chat error", error);
    return response({ error: error instanceof Error ? error.message : "Não foi possível processar a comunicação." }, 400, origin);
  }
});
