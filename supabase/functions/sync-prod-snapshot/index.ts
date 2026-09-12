import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const prodUrl = (Deno.env.get("PROD_SUPABASE_URL") || "").replace(/\/$/, "");
const prodKey = Deno.env.get("PROD_SUPABASE_SERVICE_ROLE_KEY") || "";
const allowedOrigins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "https://dominiomaestro.com.br",
]);
const ENTITIES = ["Client", "Project", "Job", "Subtask", "JobHistory", "AgendaEvent", "Collaborator"];
const PAGE_SIZE = 500;

type Session = { sub: string; exp: number };
type LegacyRow = {
  entity: string;
  record_id: string;
  payload: Record<string, unknown>;
  source_created_at: string | null;
  source_updated_at: string | null;
};

function corsHeaders(origin = "") {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://dominiomaestro.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function authorize(token: string) {
  if (!sessionSecret) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  try {
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
    if (!valid) return false;

    const session = JSON.parse(decode(body)) as Session;
    if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return false;
    const { data } = await supabase
      .from("maestro_collaborators")
      .select("is_active, profile")
      .eq("id", session.sub)
      .maybeSingle();
    return Boolean(data?.is_active && String(data.profile?.access_level || "") === "master");
  } catch {
    return false;
  }
}

async function loadProdRows(entity: string, offset: number) {
  const query = new URLSearchParams({
    select: "entity,record_id,payload,source_created_at,source_updated_at",
    entity: `eq.${entity}`,
    order: "record_id",
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  const response = await fetch(`${prodUrl}/rest/v1/legacy_records?${query}`, {
    headers: { apikey: prodKey, Authorization: `Bearer ${prodKey}` },
  });
  if (!response.ok) throw new Error(`Falha ao ler o Prod (${response.status})`);
  return await response.json() as LegacyRow[];
}

async function loadDevIds(entity: string) {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("legacy_records")
      .select("record_id")
      .eq("entity", entity)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    (data || []).forEach((row) => ids.add(String(row.record_id)));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return ids;
}

async function syncEntity(entity: string) {
  const devIds = await loadDevIds(entity);
  let prodCount = 0;
  let added = 0;
  let changed = 0;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await loadProdRows(entity, offset);
    if (!rows.length) break;
    const payload = rows.map((row) => ({ ...row, record_id: String(row.record_id) }));
    payload.forEach((row) => {
      prodCount += 1;
      if (!devIds.has(row.record_id)) added += 1;
      else if (row.source_updated_at) changed += 1;
    });

    const { error } = await supabase.from("legacy_records").upsert(payload, { onConflict: "entity,record_id" });
    if (error) throw error;
    if (rows.length < PAGE_SIZE) break;
  }

  return { entity, prod: prodCount, devAntes: devIds.size, novos: added, alterados: changed, removidos: 0 };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    if (!prodUrl || !prodKey) return json({ error: "A sincronização Prod → Dev ainda não foi configurada." }, 503, origin);

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !(await authorize(token))) return json({ error: "Acesso restrito ao Master." }, 403, origin);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "sync") return json({ error: "Ação de snapshot não informada." }, 400, origin);
    const force = body.force === true;
    const requestedEntities = Array.isArray(body.entities) && body.entities.length
      ? body.entities.filter((entity): entity is string => typeof entity === "string" && ENTITIES.includes(entity))
      : ENTITIES;
    if (!requestedEntities.length || requestedEntities.length !== (Array.isArray(body.entities) && body.entities.length ? body.entities.length : requestedEntities.length)) {
      return json({ error: "Entidades de snapshot inválidas." }, 400, origin);
    }
    const summary = [];
    for (const entity of requestedEntities) summary.push(await syncEntity(entity));

    return json({
      data: {
        destination: "dev",
        source: "prod",
        mode: "upsert_only",
        force,
        completedAt: new Date().toISOString(),
        summary,
      },
    }, 200, origin);
  } catch (error) {
    console.error("Prod to Dev snapshot error:", error);
    return json({ error: "Não foi possível concluir o snapshot do Prod para o Dev." }, 500, origin);
  }
});
