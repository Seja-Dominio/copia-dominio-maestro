import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

type Session = { sub: string; exp: number };
type LegacyRow = { payload: Record<string, unknown>; record_id: string };

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function getAdminSession(token: string): Promise<{ session: Session; collaborator: Record<string, unknown> } | null> {
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

  const { data, error } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active, profile")
    .eq("id", session.sub)
    .maybeSingle();
  if (error || !data?.is_active) return null;

  const accessLevel = data.profile?.access_level;
  if (accessLevel !== "master") return null;
  return { session, collaborator: data.profile || {} };
}

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function findTimesheet(id: string) {
  const { data, error } = await supabase
    .from("legacy_records")
    .select("payload, record_id")
    .eq("entity", "Timesheet")
    .eq("record_id", id)
    .maybeSingle<LegacyRow>();
  if (error) throw error;
  return data;
}

async function writeDeleteLog(timesheet: Record<string, unknown>, actor: { session: Session; collaborator: Record<string, unknown> }, reason: string, deletedAt: string) {
  const { error } = await supabase.from("legacy_records").upsert({
    entity: "DeleteLog",
    record_id: crypto.randomUUID().replaceAll("-", ""),
    payload: {
      entity_type: "timesheet",
      entity_id: timesheet.id,
      entity_data: timesheet,
      deleted_by: actor.session.sub,
      deleted_by_name: actor.collaborator.name || actor.collaborator.full_name || "Master",
      deleted_at: deletedAt,
      reason,
      is_restored: false,
    },
    source_created_at: deletedAt,
    source_updated_at: deletedAt,
  });
  if (error) throw error;
}

async function deleteOne(id: string, actor: { session: Session; collaborator: Record<string, unknown> }, reason: string, deletedAt: string) {
  const row = await findTimesheet(id);
  if (!row) return false;
  await writeDeleteLog(row.payload, actor, reason, deletedAt);
  const { error } = await supabase.from("legacy_records").delete().eq("entity", "Timesheet").eq("record_id", id);
  if (error) throw error;
  return true;
}

async function listTimesheets() {
  const rows: LegacyRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("legacy_records")
      .select("payload, record_id")
      .eq("entity", "Timesheet")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...((data || []) as LegacyRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const actor = token ? await getAdminSession(token) : null;
    if (!actor) return json({ error: "Acesso administrativo necessário" }, 403, origin);

    const body = await request.json();
    const action = String(body.action || "");
    const now = new Date().toISOString();

    if (action === "delete") {
      const id = String(body.timesheetId || body.id || "");
      if (!id) return json({ error: "timesheetId obrigatório" }, 400, origin);
      const deleted = await deleteOne(id, actor, "", now);
      return deleted ? json({ success: true, message: "Timesheet excluído e registrado" }, 200, origin) : json({ error: "Timesheet não encontrado" }, 404, origin);
    }

    if (action === "clear") {
      const rows = await listTimesheets();
      let deletedCount = 0;
      for (const row of rows) {
        try {
          if (await deleteOne(row.record_id, actor, "Limpeza em massa do sistema", now)) deletedCount++;
        } catch (error) {
          console.error(`Erro ao excluir timesheet ${row.record_id}:`, error);
        }
      }
      return json({ success: true, deletedCount, message: `${deletedCount} timesheets excluídos e registrados` }, 200, origin);
    }

    if (action === "reset") {
      const rows = (await listTimesheets()).filter((row) => row.payload.is_running === true);
      let stopped = 0;
      for (const row of rows) {
        const startedAt = new Date(String(row.payload.started_at || now)).getTime();
        const duration = Math.max(1, Math.floor((Date.now() - startedAt) / 60000));
        const { error } = await supabase.from("legacy_records").update({
          payload: { ...row.payload, is_running: false, ended_at: now, duration_minutes: duration },
          source_updated_at: now,
        }).eq("entity", "Timesheet").eq("record_id", row.record_id);
        if (error) throw error;
        stopped++;
      }
      return json({ success: true, stopped }, 200, origin);
    }

    return json({ error: "Ação não suportada" }, 400, origin);
  } catch (error) {
    console.error("Admin timesheets error:", error);
    return json({ error: "Erro ao processar a operação administrativa" }, 500, origin);
  }
});
