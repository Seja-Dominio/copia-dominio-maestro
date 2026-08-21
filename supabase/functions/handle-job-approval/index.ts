import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
    .select("payload")
    .eq("entity", entity)
    .eq("record_id", recordId)
    .maybeSingle();
  if (error) throw error;
  return data?.payload || null;
}

async function updateRecord(entity: string, recordId: string, payload: Record<string, unknown>) {
  const { error } = await supabase
    .from("legacy_records")
    .update({ payload, source_updated_at: new Date().toISOString() })
    .eq("entity", entity)
    .eq("record_id", recordId);
  if (error) throw error;
}

async function createRecord(entity: string, payload: Record<string, unknown>) {
  const recordId = String(payload.id || crypto.randomUUID().replaceAll("-", ""));
  const nextPayload = { ...payload, id: recordId };
  const now = new Date().toISOString();
  const { error } = await supabase.from("legacy_records").insert({
    entity,
    record_id: recordId,
    payload: nextPayload,
    source_created_at: nextPayload.created_date || now,
    source_updated_at: now,
  });
  if (error) throw error;
  return nextPayload;
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);

    const { jobId, token, action, feedback } = await request.json();
    if (!jobId || !token || !action) {
      return json({ error: "jobId, token e action são obrigatórios" }, 400);
    }

    const secret = Deno.env.get("APPROVAL_TOKEN_SECRET");
    if (!secret) return json({ error: "Server misconfigured" }, 500);

    const tokenData = await verifyApprovalToken(String(token), secret);
    if (!tokenData) return json({ error: "Token inválido ou adulterado" }, 400);
    if (tokenData.jobId !== jobId) return json({ error: "Token não corresponde ao job" }, 400);
    if (!Number.isFinite(tokenData.ts) || Date.now() - tokenData.ts > 30 * 24 * 60 * 60 * 1000) {
      return json({ error: "Link expirado. Solicite um novo link de aprovação." }, 400);
    }

    const job = await readRecord("Job", String(jobId));
    if (!job) return json({ error: "Job não encontrado" }, 404);

    if (action === "load") return json({ job });
    if (job.status !== "internal_approval" && job.status !== "client_approval") {
      return json({ error: "Este job não está mais aguardando aprovação", currentStatus: job.status }, 400);
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
      return json({ error: "Ação inválida. Use 'approve' ou 'request_changes'" }, 400);
    }

    await updateRecord("Job", String(jobId), { ...job, status: newStatus });
    await createRecord("JobHistory", {
      job_id: jobId,
      type: "change",
      text: historyText,
      user: "Cliente",
      field: "status",
      old_value: job.status,
      new_value: newStatus,
    });

    if (feedback && String(feedback).trim()) {
      await createRecord("Comment", {
        entity_type: "job",
        entity_id: jobId,
        entity_title: job.title,
        author_name: "Cliente",
        content: `💬 Feedback de aprovação:\n${feedback}`,
      });
    }

    if (job.responsible_id) {
      const approved = action === "approve";
      await createRecord("Notification", {
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

    return json({ success: true, newStatus, action });
  } catch (error) {
    console.error("handle-job-approval error:", error);
    return json({ error: "Erro ao processar aprovação" }, 500);
  }
});
