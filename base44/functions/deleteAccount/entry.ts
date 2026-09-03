import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userEmail = user.email;
    const userName = user.full_name || userEmail;

    // 1. Delete collaborator record if exists
    const collaborators = await base44.asServiceRole.entities.Collaborator.filter({ email: userEmail });
    for (const c of collaborators) {
      await base44.asServiceRole.entities.Collaborator.delete(c.id);
    }

    // 2. Delete timesheets created by this user
    const timesheets = await base44.asServiceRole.entities.Timesheet.filter({ collaborator_id: collaborators[0]?.id || "__none__" });
    for (const t of timesheets) {
      await base44.asServiceRole.entities.Timesheet.delete(t.id);
    }

    // 3. Delete notifications for this user
    const notifications = await base44.asServiceRole.entities.Notification.filter({ user_id: collaborators[0]?.id || "__none__" });
    for (const n of notifications) {
      await base44.asServiceRole.entities.Notification.delete(n.id);
    }

    // 4. Send confirmation email
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: userEmail,
      subject: "Sua conta foi excluída — Domínio Performance",
      body: `Olá ${userName},\n\nSua conta e dados associados foram removidos com sucesso do sistema Domínio Performance.\n\nSe isso foi um erro, entre em contato com o administrador.\n\nAtenciosamente,\nEquipe Domínio Performance`
    });

    return Response.json({ success: true, message: "Conta excluída com sucesso." });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}