import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasActiveOrganizationProduct } from "../_shared/organization-products.mjs";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const attachmentBucket = "job-attachments";
const allowedOrigins = new Set(["http://127.0.0.1:4173", "http://localhost:4173", "https://dominiomaestro.com.br"]);
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

function hexToBytes(value: string) {
  const matches = value.match(/.{2}/g);
  if (!matches || matches.length !== 32) return null;
  return new Uint8Array(matches.map((part) => Number.parseInt(part, 16)));
}

async function verifyApprovalToken(token: string, secret: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = atob(encodedPayload);
  } catch {
    return null;
  }

  const signatureBytes = hexToBytes(signature);
  if (!signatureBytes) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(payload),
  );
  if (!valid) return null;

  try {
    return JSON.parse(payload) as { jobId: string; ts: number };
  } catch {
    return null;
  }
}

async function readRecord(entity: string, recordId: string) {
  const { data, error } = await supabase
    .from("legacy_records")
    .select("payload,organization_id")
    .eq("entity", entity)
    .eq("record_id", recordId)
    .maybeSingle();
  if (error) throw error;
  return data ? { payload: data.payload || null, organization_id: String(data.organization_id || "") } : null;
}

async function updateRecord(entity: string, recordId: string, organizationId: string, payload: Record<string, unknown>) {
  const { error } = await supabase
    .from("legacy_records")
    .update({ payload, source_updated_at: new Date().toISOString() })
    .eq("entity", entity)
    .eq("record_id", recordId)
    .eq("organization_id", organizationId);
  if (error) throw error;
}

async function createRecord(entity: string, organizationId: string, payload: Record<string, unknown>) {
  const recordId = String(payload.id || crypto.randomUUID().replaceAll("-", ""));
  const nextPayload = { ...payload, id: recordId };
  const now = new Date().toISOString();
  const { error } = await supabase.from("legacy_records").insert({
    entity,
    record_id: recordId,
    organization_id: organizationId,
    payload: nextPayload,
    source_created_at: nextPayload.created_date || now,
    source_updated_at: now,
  });
  if (error) throw error;
  return nextPayload;
}

function attachmentPath(attachment: Record<string, unknown>) {
  if (attachment.path) return String(attachment.path);
  const url = String(attachment.url || "");
  const marker = `/storage/v1/object/sign/${attachmentBucket}/`;
  if (!url.includes(marker)) return "";
  const rawPath = url.slice(url.indexOf(marker) + marker.length).split("?")[0];
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

async function refreshJobAttachments(job: Record<string, unknown>) {
  if (!Array.isArray(job.attachments)) return job;
  const attachments = await Promise.all((job.attachments as Record<string, unknown>[]).map(async (attachment) => {
    const path = attachmentPath(attachment);
    if (!path) return attachment;
    const { data, error } = await supabase.storage.from(attachmentBucket).createSignedUrl(path, 60 * 60 * 24);
    return error ? attachment : { ...attachment, path, url: data.signedUrl };
  }));
  return { ...job, attachments };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);

    const { jobId, token, action, feedback } = await request.json();
    if (!jobId || !token || !action) {
      return json({ error: "jobId, token e action são obrigatórios" }, 400, origin);
    }

    const secret = Deno.env.get("APPROVAL_TOKEN_SECRET");
    if (!secret) return json({ error: "Server misconfigured" }, 500, origin);

    const tokenData = await verifyApprovalToken(String(token), secret);
    if (!tokenData) return json({ error: "Token inválido ou adulterado" }, 400, origin);
    if (tokenData.jobId !== jobId) return json({ error: "Token não corresponde ao job" }, 400, origin);
    if (!Number.isFinite(tokenData.ts) || Date.now() - tokenData.ts > 30 * 24 * 60 * 60 * 1000) {
      return json({ error: "Link expirado. Solicite um novo link de aprovação." }, 400, origin);
    }

    const jobRecord = await readRecord("Job", String(jobId));
    if (!jobRecord?.payload || !jobRecord.organization_id) return json({ error: "Job não encontrado" }, 404, origin);
    const job = jobRecord.payload;
    const organizationId = jobRecord.organization_id;

    const { data: products, error: productsError } = await supabase.from("organization_products")
      .select("product_key,status,expires_at")
      .eq("organization_id", organizationId)
      .eq("product_key", "maestro");
    if (productsError) throw productsError;
    if (!hasActiveOrganizationProduct(products, "maestro")) {
      return json({ error: "O produto Maestro não está habilitado para esta organização." }, 403, origin);
    }

    if (action === "load") return json({ job: await refreshJobAttachments(job) }, 200, origin);
    if (job.status !== "internal_approval" && job.status !== "client_approval") {
      return json({ error: "Este job não está mais aguardando aprovação", currentStatus: job.status }, 400, origin);
    }

    let newStatus: string;
    let historyText: string;
    if (action === "approve") {
      newStatus = "scheduled";
      historyText = "✅ Aprovado pelo cliente";
    } else if (action === "request_changes") {
      newStatus = "pending_design";
      historyText = `🔄 Cliente solicitou alterações: ${feedback || "sem detalhes"}`;
    } else {
      return json({ error: "Ação inválida. Use 'approve' ou 'request_changes'" }, 400, origin);
    }

    await updateRecord("Job", String(jobId), organizationId, { ...job, status: newStatus });
    await createRecord("JobHistory", organizationId, {
      job_id: jobId,
      type: "change",
      text: historyText,
      user: "Cliente",
      field: "status",
      old_value: job.status,
      new_value: newStatus,
    });

    if (feedback && String(feedback).trim()) {
      await createRecord("Comment", organizationId, {
        entity_type: "job",
        entity_id: jobId,
        entity_title: job.title,
        author_name: "Cliente",
        content: `💬 Feedback de aprovação:\n${feedback}`,
      });
    }

    if (job.responsible_id) {
      const approved = action === "approve";
      await createRecord("Notification", organizationId, {
        user_id: job.responsible_id,
        type: "approval_pending",
        title: approved
          ? `✅ Job "${job.title}" aprovado pelo cliente`
          : `🔄 Job "${job.title}" — cliente pediu alterações`,
        message: approved
          ? `O job "${job.title}" foi aprovado e movido para "Agendado".`
          : `O cliente solicitou alterações no job "${job.title}". ${feedback ? `Feedback: ${feedback}` : "Verifique os comentários."}`,
        entity_type: "job",
        entity_id: jobId,
        is_read: false,
      });
    }

    return json({ success: true, newStatus, action }, 200, origin);
  } catch (error) {
    console.error("handle-job-approval error:", error);
    return json({ error: "Erro ao processar aprovação" }, 500, origin);
  }
});
