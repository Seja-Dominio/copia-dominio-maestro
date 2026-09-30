import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { accessLevelForOrganizationRole, selectOrganizationMembership } from "../_shared/maestro-tenant.mjs";
import { collaboratorCanReadJob, jobContainsAttachmentPath, normalizeAttachmentPath } from "../_shared/attachment-access.mjs";

const bucket = "job-attachments";
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

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function verifySession(token: string): Promise<{ session: Session; collaborator: Collaborator } | null> {
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
  const session = JSON.parse(decode(body)) as { sub?: string; exp?: number; organization_id?: string; scope?: string };
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000) || session.scope === "group") return null;
  const { data, error: collaboratorError } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active, profile")
    .eq("id", session.sub)
    .maybeSingle();
  if (collaboratorError || !data?.is_active) return null;
  let membershipsQuery = supabase.from("organization_members")
    .select("organization_id, role, status, organizations!inner(status)")
    .eq("collaborator_id", data.id)
    .eq("status", "active")
    .eq("organizations.status", "active")
    .limit(2);
  if (session.organization_id) membershipsQuery = membershipsQuery.eq("organization_id", session.organization_id);
  const { data: memberships, error: membershipError } = await membershipsQuery;
  if (membershipError) return null;
  const choice = selectOrganizationMembership(memberships, session.organization_id);
  if (!choice.ok) return null;
  return {
    session: {
      sub: String(data.id),
      exp: Number(session.exp),
      organization_id: choice.membership.organization_id,
      access_level: accessLevelForOrganizationRole(choice.membership.organization_role),
    },
    collaborator: data as Collaborator,
  };
}

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const verified = token ? await verifySession(token) : null;
    if (!verified) return json({ error: "Sessão inválida ou expirada" }, 401, origin);

    const body = await request.json() as { path?: unknown; job_id?: unknown };
    const path = normalizeAttachmentPath(String(body.path || "").trim());
    const jobId = String(body.job_id || "").trim();
    if (!jobId || jobId.length > 128 || !path || path.length > 512 || path.startsWith("/") || path.includes("..") || path.includes("\\") || path.includes("\0")) {
      return json({ error: "Caminho de anexo inválido" }, 400, origin);
    }

    const { data: jobRows, error: jobError } = await supabase.from("legacy_records")
      .select("record_id, payload")
      .eq("entity", "Job")
      .eq("organization_id", verified.session.organization_id)
      .or(`record_id.eq.${jobId},payload->>id.eq.${jobId}`)
      .limit(2);
    if (jobError) throw jobError;
    if (!jobRows?.length) return json({ error: "Job não encontrado" }, 404, origin);
    if (jobRows.length !== 1) return json({ error: "Job ambíguo" }, 409, origin);
    const jobRow = jobRows[0];
    const jobPayload = { ...(jobRow.payload || {}), id: String(jobRow.payload?.id || jobRow.record_id) };
    let subtasks: Array<{ payload: Record<string, unknown> }> = [];
    if (!["master", "gestor"].includes(verified.session.access_level)) {
      const { data, error } = await supabase.from("legacy_records")
        .select("payload")
        .eq("entity", "Subtask")
        .eq("organization_id", verified.session.organization_id)
        .eq("payload->>job_id", String(jobRow.payload?.id || jobRow.record_id));
      if (error) throw error;
      subtasks = (data || []) as Array<{ payload: Record<string, unknown> }>;
    }
    if (!collaboratorCanReadJob({ accessLevel: verified.session.access_level, collaboratorId: verified.collaborator.id, jobPayload, subtasks })) {
      return json({ error: "Você não tem acesso a este job" }, 403, origin);
    }
    const { data: comments, error: commentsError } = await supabase.from("legacy_records")
      .select("payload")
      .eq("entity", "Comment")
      .eq("organization_id", verified.session.organization_id)
      .eq("payload->>entity_id", String(jobRow.payload?.id || jobRow.record_id))
      .eq("payload->>entity_type", "job");
    if (commentsError) throw commentsError;
    if (!jobContainsAttachmentPath(jobPayload, (comments || []).map((row) => row.payload || {}), path)) {
      return json({ error: "O anexo não pertence a este job" }, 404, origin);
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
    if (error) throw error;
    return json({ file_url: data.signedUrl, path }, 200, origin);
  } catch (error) {
    console.error("refresh-file-url error:", error);
    return json({ error: "Não foi possível renovar o anexo" }, 500, origin);
  }
});
type Session = { sub: string; exp: number; organization_id: string; access_level: string };
type Collaborator = { id: string; is_active: boolean; profile?: Record<string, unknown> | null };
