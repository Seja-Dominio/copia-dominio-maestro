import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Session = { sub: string; exp: number; access_level?: string };
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

  const { data } = await supabase
    .from("maestro_collaborators")
    .select("id, is_active")
    .eq("id", session.sub)
    .maybeSingle();
  return data?.is_active ? session : null;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function matches(payload: Record<string, unknown>, filters: Record<string, unknown>) {
  return Object.entries(filters || {}).every(([field, expected]) => {
    const actual = payload[field];
    if (Array.isArray(expected)) return JSON.stringify(actual) === JSON.stringify(expected);
    return actual === expected;
  });
}

function sortRows(rows: LegacyRow[], sort?: string) {
  if (!sort) return rows;
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  return [...rows].sort((left, right) => {
    const a = left.payload[field];
    const b = right.payload[field];
    if (a === b) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const result = String(a).localeCompare(String(b), undefined, { numeric: true });
    return descending ? -result : result;
  });
}

async function listRows(entity: string) {
  const rows: LegacyRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("legacy_records")
      .select("entity, record_id, payload, source_created_at, source_updated_at")
      .eq("entity", entity)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...((data || []) as LegacyRow[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function handleOperation(body: Record<string, unknown>) {
  const entity = String(body.entity || "");
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(entity)) return json({ error: "Entidade inválida" }, 400);

  const operation = String(body.operation || "list");
  if (["list", "filter"].includes(operation)) {
    let rows = await listRows(entity);
    if (operation === "filter") rows = rows.filter((row) => matches(row.payload, (body.filters || {}) as Record<string, unknown>));
    rows = sortRows(rows, typeof body.sort === "string" ? body.sort : undefined);
    const limit = Number(body.limit || 100);
    return json({ data: rows.slice(0, Math.max(0, limit)).map((row) => row.payload) });
  }

  if (operation === "create" || operation === "update") {
    const payload = (body.data || {}) as Record<string, unknown>;
    const recordId = operation === "update"
      ? String(body.id || "")
      : String(payload.id || crypto.randomUUID().replaceAll("-", ""));
    if (!recordId) return json({ error: "ID inválido" }, 400);

    let nextPayload = { ...payload, id: recordId };
    if (operation === "update") {
      const { data: current, error: currentError } = await supabase
        .from("legacy_records")
        .select("payload")
        .eq("entity", entity)
        .eq("record_id", recordId)
        .maybeSingle();
      if (currentError) throw currentError;
      nextPayload = { ...(current?.payload || {}), ...payload, id: recordId };
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("legacy_records").upsert({
      entity,
      record_id: recordId,
      payload: nextPayload,
      source_created_at: nextPayload.created_date || now,
      source_updated_at: now,
    }, { onConflict: "entity,record_id" });
    if (error) throw error;
    return json({ data: nextPayload });
  }

  if (operation === "bulkCreate") {
    const values = Array.isArray(body.data) ? body.data : [];
    const rows = values.map((value) => {
      const payload = { ...(value as Record<string, unknown>) };
      const id = String(payload.id || crypto.randomUUID().replaceAll("-", ""));
      payload.id = id;
      const now = new Date().toISOString();
      return { entity, record_id: id, payload, source_created_at: payload.created_date || now, source_updated_at: now };
    });
    const { error } = await supabase.from("legacy_records").upsert(rows, { onConflict: "entity,record_id" });
    if (error) throw error;
    return json({ data: rows.map((row) => row.payload) });
  }

  if (operation === "delete") {
    const recordId = String(body.id || "");
    const { error } = await supabase.from("legacy_records").delete().eq("entity", entity).eq("record_id", recordId);
    if (error) throw error;
    return json({ data: { id: recordId } });
  }

  return json({ error: "Operação não suportada" }, 400);
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const session = token ? await verifySession(token) : null;
    if (!session) return json({ error: "Sessão inválida ou expirada" }, 401);
    return await handleOperation(await request.json());
  } catch (error) {
    console.error("Maestro data error:", error);
    return json({ error: "Erro ao processar a operação" }, 500);
  }
});
