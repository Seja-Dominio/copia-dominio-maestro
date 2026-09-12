import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const STATUS_LABELS = {
  pending_briefing: "Aguardando Briefing",
  pending_capture: "Aguardando Captação",
  pending_design: "Aguardando Design",
  pending_edit: "Aguardando Edição",
  internal_approval: "Aprovação Interna",
  client_approval: "Aprovação Cliente",
  scheduled: "Agendado",
  completed: "Concluído",
};

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    // Permite chamada via automação (sem user autenticado) usando service role
    const jobs = await base44.asServiceRole.entities.Job.list("-post_date", 500);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in5Days = new Date(today);
    in5Days.setDate(in5Days.getDate() + 5);

    const overdueJobs = [];
    const upcomingJobs = [];

    for (const job of jobs) {
      if (!job.post_date) continue;
      if (job.status === "completed") continue;

      const postDate = new Date(job.post_date + "T12:00:00");

      const isOverdue = postDate < today && job.status !== "scheduled";
      const isUpcoming = postDate >= today && postDate <= in5Days && job.status !== "scheduled";

      if (isOverdue) overdueJobs.push(job);
      else if (isUpcoming) upcomingJobs.push(job);
    }

    if (overdueJobs.length === 0 && upcomingJobs.length === 0) {
      return Response.json({ message: "Nenhum alerta necessário.", overdue: 0, upcoming: 0 });
    }

    // Busca todos os colaboradores ativos para notificar admins
    const collaborators = await base44.asServiceRole.entities.Collaborator.filter({ is_active: true }, "name", 200);
    const admins = collaborators.filter(c => c.access_level === "admin");

    const notifications = [];

    // Para cada job em atraso: notifica o responsável + admins
    for (const job of overdueJobs) {
      const targets = new Set();
      if (job.responsible_id) targets.add(job.responsible_id);
      admins.forEach(a => targets.add(a.id));

      const postDateStr = new Date(job.post_date + "T12:00:00").toLocaleDateString("pt-BR");
      const statusLabel = STATUS_LABELS[job.status] || job.status;

      for (const userId of targets) {
        notifications.push(
          base44.asServiceRole.entities.Notification.create({
            user_id: userId,
            type: "job_overdue",
            title: `⚠️ Job em atraso: ${job.title}`,
            message: `O job "${job.title}" (${job.client_name || "—"}) tinha postagem em ${postDateStr} e ainda está em "${statusLabel}". Verifique imediatamente.`,
            entity_type: "job",
            entity_id: job.id,
            is_read: false,
          })
        );
      }
    }

    // Para cada job com postagem nos próximos 5 dias: notifica responsável + admins
    for (const job of upcomingJobs) {
      const targets = new Set();
      if (job.responsible_id) targets.add(job.responsible_id);
      admins.forEach(a => targets.add(a.id));

      const postDate = new Date(job.post_date + "T12:00:00");
      const diffDays = Math.round((postDate - today) / (1000 * 60 * 60 * 24));
      const postDateStr = postDate.toLocaleDateString("pt-BR");
      const statusLabel = STATUS_LABELS[job.status] || job.status;
      const daysText = diffDays === 0 ? "hoje" : diffDays === 1 ? "amanhã" : `em ${diffDays} dias`;

      for (const userId of targets) {
        notifications.push(
          base44.asServiceRole.entities.Notification.create({
            user_id: userId,
            type: "deadline_approaching",
            title: `📅 Postagem ${daysText}: ${job.title}`,
            message: `O job "${job.title}" (${job.client_name || "—"}) posta ${daysText} (${postDateStr}) e ainda está em "${statusLabel}". Não esqueça de agendar!`,
            entity_type: "job",
            entity_id: job.id,
            is_read: false,
          })
        );
      }
    }

    await Promise.all(notifications);

    return Response.json({
      message: "Notificações enviadas com sucesso.",
      overdue: overdueJobs.length,
      upcoming: upcomingJobs.length,
      notifications_created: notifications.length,
    });
  } catch (error) {
    console.error("jobAlertNotifications error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}