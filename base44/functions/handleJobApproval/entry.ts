import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { verifyToken } from '../../shared/hmac.ts';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const { jobId, token, action, feedback } = await req.json();

    if (!jobId || !token || !action) {
      return Response.json({ error: "jobId, token e action são obrigatórios" }, { status: 400 });
    }

    // Validate signed token
    const secret = secrets.get("APPROVAL_TOKEN_SECRET");
    if (!secret) return Response.json({ error: "Server misconfigured" }, { status: 500 });

    const tokenData = await verifyToken(token, secret);
    if (!tokenData) {
      return Response.json({ error: "Token inválido ou adulterado" }, { status: 400 });
    }

    if (tokenData.jobId !== jobId) {
      return Response.json({ error: "Token não corresponde ao job" }, { status: 400 });
    }

    // Check token is not older than 30 days
    if (Date.now() - tokenData.ts > 30 * 24 * 60 * 60 * 1000) {
      return Response.json({ error: "Link expirado. Solicite um novo link de aprovação." }, { status: 400 });
    }

    // Fetch job using service role (public page, no user auth)
    const jobs = await base44.asServiceRole.entities.Job.filter({ id: jobId });
    const job = jobs[0];
    if (!job) return Response.json({ error: "Job não encontrado" }, { status: 404 });

    if (job.status !== "internal_approval" && job.status !== "client_approval") {
      return Response.json({ error: "Este job não está mais aguardando aprovação", currentStatus: job.status }, { status: 400 });
    }

    let newStatus;
    let historyText;

    if (action === "approve") {
      newStatus = "scheduled";
      historyText = "✅ Aprovado pelo cliente";
    } else if (action === "request_changes") {
      newStatus = "pending_design";
      historyText = `🔄 Cliente solicitou alterações: ${feedback || "sem detalhes"}`;
    } else {
      return Response.json({ error: "Ação inválida. Use 'approve' ou 'request_changes'" }, { status: 400 });
    }

    // Update job status
    await base44.asServiceRole.entities.Job.update(jobId, { status: newStatus });

    // Add history entry
    await base44.asServiceRole.entities.JobHistory.create({
      job_id: jobId,
      type: "change",
      text: historyText,
      user: "Cliente",
      field: "status",
      old_value: job.status,
      new_value: newStatus,
    });

    // Add feedback as comment if provided
    if (feedback && feedback.trim()) {
      await base44.asServiceRole.entities.Comment.create({
        entity_type: "job",
        entity_id: jobId,
        entity_title: job.title,
        author_name: "Cliente",
        content: `💬 Feedback de aprovação:\n${feedback}`,
      });
    }

    // Notify job responsible
    if (job.responsible_id) {
      const title = action === "approve"
        ? `✅ Job "${job.title}" aprovado pelo cliente`
        : `🔄 Job "${job.title}" — cliente pediu alterações`;
      const message = action === "approve"
        ? `O job "${job.title}" foi aprovado e movido para "Agendado".`
        : `O cliente solicitou alterações no job "${job.title}". ${feedback ? `Feedback: ${feedback}` : "Verifique os comentários."}`;

      await base44.asServiceRole.entities.Notification.create({
        user_id: job.responsible_id,
        type: "approval_pending",
        title,
        message,
        entity_type: "job",
        entity_id: jobId,
        is_read: false,
      });
    }

    return Response.json({ success: true, newStatus, action });
  } catch (error) {
    console.error("handleJobApproval error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}