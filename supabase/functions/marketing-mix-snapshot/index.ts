import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasActiveOrganizationProduct } from "../_shared/organization-products.mjs";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const allowedOrigin = "https://dominiomaestro.com.br";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "content-type, x-mmm-timestamp, x-mmm-signature",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

async function authenticate(request: Request, rawBody: string) {
  const secret = Deno.env.get("MMM_SNAPSHOT_SECRET") || "";
  const timestamp = request.headers.get("x-mmm-timestamp") || "";
  const signature = request.headers.get("x-mmm-signature") || "";
  const timestampNumber = Number(timestamp);
  if (!secret || !timestamp || !signature || !Number.isInteger(timestampNumber)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return equal(signature.toLowerCase(), expected);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const rawBody = await request.text();
    if (!(await authenticate(request, rawBody))) return json({ error: "Assinatura inválida ou expirada." }, 401);

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const clientId = String(body.client_id || "").trim();
    const start = body.start === undefined ? null : body.start;
    const end = body.end === undefined ? null : body.end;
    if (!clientId) return json({ error: "client_id é obrigatório." }, 400);
    if ((start !== null && !isIsoDate(start)) || (end !== null && !isIsoDate(end))) {
      return json({ error: "start e end devem estar no formato YYYY-MM-DD." }, 400);
    }

    const { data: clientScopes, error: scopeError } = await db
      .from("organization_legacy_records")
      .select("organization_id, organizations!inner(status)")
      .eq("legacy_entity", "Client")
      .eq("legacy_record_id", clientId)
      .eq("scope_status", "confirmed")
      .eq("organizations.status", "active")
      .limit(2);
    if (scopeError) throw scopeError;
    if (!clientScopes || clientScopes.length !== 1) {
      return json({ error: "Cliente indisponível para esta análise." }, 404);
    }

    const organizationId = clientScopes[0].organization_id;
    const { data: products, error: productError } = await db
      .from("organization_products")
      .select("product_key, status, expires_at")
      .eq("organization_id", organizationId)
      .eq("product_key", "insights")
      .in("status", ["trial", "enabled"]);
    if (productError) throw productError;
    if (!hasActiveOrganizationProduct(products || [], "insights")) {
      return json({ error: "O produto Insights não está habilitado para esta organização." }, 403);
    }

    let query = db
      .from("marketing_mix_observations")
      .select("time,geo,kpi,paid,organic,searches,leads,controls,source")
      .eq("organization_id", organizationId)
      .eq("client_id", clientId)
      .order("time", { ascending: true })
      .limit(5000);
    if (start) query = query.gte("time", start);
    if (end) query = query.lte("time", end);
    const { data, error } = await query;
    if (error) throw error;

    return json({
      client_id: clientId,
      observations: data || [],
      count: data?.length || 0,
      generated_at: new Date().toISOString(),
      source: "supabase_aggregate",
    });
  } catch (error) {
    console.error("Marketing mix snapshot error:", error);
    return json({ error: "Não foi possível consultar os dados agregados." }, 500);
  }
});
