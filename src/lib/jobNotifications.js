import { invokeMaestroFunction, maestro } from "@/api/maestroClient";

function collaboratorPhone(collaborator) {
  return collaborator?.whatsapp_phone || collaborator?.phone || collaborator?.phone_number || collaborator?.whatsapp || "";
}

async function notifyNewDemand(job, subtask, collaborator) {
  const recipientId = subtask.responsible_id;
  if (!recipientId) return;
  const taskTitle = subtask.title || "Tarefa atribuída";
  const clientName = job.client_name || "Cliente não identificado";
  const message = `Uma nova demanda foi atribuída a você.\n\nCliente: ${clientName}\nJob: ${job.title || "Job sem título"}\nTarefa: ${taskTitle}${subtask.deadline ? `\nPrazo: ${subtask.deadline.split("-").reverse().join("/")}` : ""}`;

  await maestro.entities.Notification.create({
    user_id: recipientId,
    type: "job_created",
    title: "Nova demanda atribuída",
    message,
    entity_type: "job",
    entity_id: job.id,
    is_read: false,
  });

  const phone = collaboratorPhone(collaborator);
  if (!phone) return;
  try {
    await invokeMaestroFunction("sendWhatsapp", { phone, message });
  } catch (error) {
    // A falha no WhatsApp não pode impedir a notificação no sistema.
    console.warn("WhatsApp indisponível para notificação de nova demanda", error);
  }
}

/**
 * Dispara notificações para colaboradores com notify_on_status na subtarefa
 * quando o job chega na etapa configurada.
 *
 * @param {object} job - objeto do job (precisa de id, title, project_name, client_name, template_id)
 * @param {string} newStatus - novo status do job
 * @param {Array}  subtasks  - subtarefas do job (precisam de responsible_id, responsible_name, notify_on_status)
 * @param {object} statusConfig - configuração de status (opcional, para notificação por cargo)
 */
export async function fireJobStatusNotifications(job, newStatus, subtasks = [], statusConfig = null) {
  if (!newStatus) return;

  const seen = new Set();
  const promises = [];

  // 1. Notificações por subtask (notify_on_status na subtarefa)
  if (subtasks.length) {
    const toNotify = subtasks.filter(
      s => s.notify_on_status === newStatus && s.responsible_id
    );

    for (const subtask of toNotify) {
      if (seen.has(subtask.responsible_id)) continue;
      seen.add(subtask.responsible_id);

      promises.push(
        maestro.entities.Notification.create({
          user_id: subtask.responsible_id,
          type: "subtask_unlocked",
          title: `Job chegou em "${subtask.notify_on_status_label || newStatus}"`,
          message: `O job "${job.title}" (${job.client_name || ""}) chegou na etapa que requer sua atenção: "${subtask.title}". Projeto: ${job.project_name || "—"}.`,
          entity_type: "job",
          entity_id: job.id,
          is_read: false,
        })
      );
    }
  }

  // 2. Notificações por cargo (notify_role na configuração de status)
  if (statusConfig && statusConfig[newStatus]?.notify_role) {
    const roleToNotify = statusConfig[newStatus].notify_role;
    const statusLabel = statusConfig[newStatus].label || newStatus;
    
    // Pega IDs dos responsáveis das subtasks deste job
    const jobCollaboratorIds = new Set(
      subtasks.map(s => s.responsible_id).filter(Boolean)
    );
    
    if (jobCollaboratorIds.size > 0) {
      // Busca colaboradores com o cargo especificado
      const collaborators = await maestro.entities.Collaborator.filter({ role: roleToNotify, is_active: true });
      
      for (const collab of collaborators) {
        // Só notifica se o colaborador está envolvido no job (tem subtask)
        if (!jobCollaboratorIds.has(collab.id)) continue;
        // Não duplicar notificação
        if (seen.has(collab.id)) continue;
        seen.add(collab.id);

        promises.push(
          maestro.entities.Notification.create({
            user_id: collab.id,
            type: "subtask_unlocked",
            title: `Job movido para "${statusLabel}"`,
            message: `O job "${job.title}" (${job.client_name || ""}) foi movido para a etapa "${statusLabel}". Projeto: ${job.project_name || "—"}.`,
            entity_type: "job",
            entity_id: job.id,
            is_read: false,
          })
        );
      }
    }
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

/**
 * Dispara notificações de "job criado" para todos os responsáveis de subtarefas
 * que possuem notify_on_status = status inicial do job.
 *
 * @param {object} job - objeto do job recém-criado
 * @param {Array}  subtasks - subtarefas criadas junto com o job
 * @param {object} statusConfig - configuração de status (opcional)
 */
export async function fireJobCreatedNotifications(job, subtasks = [], statusConfig = null) {
  const assigned = subtasks.filter((subtask) => subtask.responsible_id);
  const uniqueRecipients = [...new Set(assigned.map((subtask) => subtask.responsible_id))];
  await Promise.all(uniqueRecipients.map(async (recipientId) => {
    const subtask = assigned.find((item) => item.responsible_id === recipientId);
    const collaborators = await maestro.entities.Collaborator.filter({ id: recipientId }, "name", 1);
    return notifyNewDemand(job, subtask, collaborators[0]);
  }));
  return fireJobStatusNotifications(job, job.status, [], statusConfig);
}

export async function fireNewSubtaskNotification(job, subtask) {
  if (!subtask?.responsible_id) return;
  const collaborators = await maestro.entities.Collaborator.filter({ id: subtask.responsible_id }, "name", 1);
  return notifyNewDemand(job, subtask, collaborators[0]);
}
