import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { signToken } from '../../shared/hmac.ts';
import { secrets } from 'base44:runtime';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const { event, data } = await req.json();

    // Only process updates where status changed to internal_approval
    if (!data || data.status !== "internal_approval") {
      return Response.json({ skipped: true, reason: "status is not internal_approval" });
    }

    const jobId = event?.entity_id || data?.id;
    if (!jobId) return Response.json({ skipped: true, reason: "no job id" });

    // Fetch job and client data
    const job = data;
    const clientId = job.client_id;
    if (!clientId) return Response.json({ skipped: true, reason: "no client_id on job" });

    const clients = await base44.asServiceRole.entities.Client.filter({ id: clientId });
    const client = clients[0];
    if (!client) return Response.json({ skipped: true, reason: "client not found" });

    const clientEmail = client.email;
    const clientPhone = client.phone;
    const clientName = client.name;

    if (!clientEmail && !clientPhone) {
      return Response.json({ skipped: true, reason: "client has no email or phone" });
    }

    // Build HMAC-signed approval token
    const secret = secrets.get("APPROVAL_TOKEN_SECRET");
    if (!secret) return Response.json({ error: "APPROVAL_TOKEN_SECRET not configured" }, { status: 500 });
    const token = await signToken({ jobId, ts: Date.now() }, secret);

    // Build the approval page URL
    const appUrl = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
    const approvalUrl = `${appUrl}/JobApproval?token=${encodeURIComponent(token)}&jobId=${jobId}`;

    const results = { email: null, whatsapp: null };

    // Send email notification
    if (clientEmail) {
      const emailBody = `
        <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); border-radius: 16px; padding: 32px; color: white; text-align: center; margin-bottom: 24px;">
            <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700;">Aprovação Pendente</h1>
            <p style="margin: 0; opacity: 0.9; font-size: 14px;">Um job aguarda sua aprovação</p>
          </div>
          
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="margin: 0 0 12px; font-size: 14px; color: #64748b;">Olá <strong>${clientName}</strong>,</p>
            <p style="margin: 0 0 16px; font-size: 14px; color: #334155;">O job abaixo está pronto para sua análise:</p>
            
            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 0 0 4px; font-size: 16px; font-weight: 700; color: #0f172a;">${job.title}</p>
              <p style="margin: 0; font-size: 13px; color: #64748b;">Projeto: ${job.project_name || "—"}</p>
              ${job.post_date ? `<p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">Data de postagem: ${job.post_date}</p>` : ""}
            </div>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${approvalUrl}" style="display: inline-block; background: #1e40af; color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px;">
              Revisar e Aprovar
            </a>
          </div>

          <p style="text-align: center; font-size: 12px; color: #94a3b8;">
            Este link é exclusivo e seguro. Clique para aprovar ou solicitar alterações.
          </p>
        </div>
      `;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: clientEmail,
        subject: `🔔 Aprovação pendente: ${job.title}`,
        body: emailBody,
      });
      results.email = "sent";
    }

    // Send WhatsApp notification if client has phone and whatsapp_group_id
    if (clientPhone || client.whatsapp_group_id) {
      const phone = client.whatsapp_group_id || clientPhone;
      const message = `🔔 *Aprovação Pendente*\n\nOlá ${clientName}!\n\nO job *${job.title}* (Projeto: ${job.project_name || "—"}) está pronto para sua aprovação.\n\n👉 Acesse o link para revisar e aprovar:\n${approvalUrl}`;

      const instanceId = secrets.get("ZAPI_INSTANCE_ID");
      const zapiToken = secrets.get("ZAPI_TOKEN");
      const clientToken = secrets.get("ZAPI_CLIENT_TOKEN");

      if (instanceId && zapiToken) {
        const zapiRes = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Client-Token": clientToken || "" },
          body: JSON.stringify({ phone, message }),
        });
        results.whatsapp = zapiRes.ok ? "sent" : "failed";
      }
    }

    // Create internal notification for the job responsible
    if (job.responsible_id) {
      await base44.asServiceRole.entities.Notification.create({
        user_id: job.responsible_id,
        type: "approval_pending",
        title: `Job "${job.title}" enviado para aprovação`,
        message: `O job "${job.title}" foi enviado para aprovação do cliente ${clientName}.`,
        entity_type: "job",
        entity_id: jobId,
        is_read: false,
      });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error("sendApprovalNotification error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}