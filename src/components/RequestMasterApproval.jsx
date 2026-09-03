import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Send, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Button that sends a request to master for approval.
 * Props:
 * - actionType: "delete_client" | "delete_project" | "delete_collaborator" | "download_report" | "download_blueprint" | "other"
 * - entityType: optional entity type string
 * - entityId: optional entity id
 * - entityName: optional display name
 * - description: optional text description
 * - label: button label (default "Solicitar ao Master")
 * - variant: button variant
 * - size: button size
 * - className: extra classes
 */
export default function RequestMasterApproval({
  actionType,
  entityType,
  entityId,
  entityName,
  description,
  label = "Solicitar ao Master",
  variant = "outline",
  size = "sm",
  className = "",
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleRequest = async () => {
    const session = sessionStorage.getItem("collaborator");
    if (!session) return;
    const collaborator = JSON.parse(session);

    setSending(true);
    try {
      // Create the request
      const request = await base44.entities.MasterRequest.create({
        requester_id: collaborator.id,
        requester_name: collaborator.name,
        action_type: actionType,
        entity_type: entityType || "",
        entity_id: entityId || "",
        entity_name: entityName || "",
        description: description || getDefaultDescription(actionType, entityName),
        status: "pending",
      });

      // Notify all masters
      const allCollabs = await base44.entities.Collaborator.filter({ is_active: true });
      const masters = allCollabs.filter(c => c.access_level === "master" || c.access_level === "admin");

      for (const master of masters) {
        await base44.entities.Notification.create({
          user_id: master.id,
          type: "master_request",
          title: "Nova requisição de gestor",
          message: `${collaborator.name} solicitou: ${getDefaultDescription(actionType, entityName)}`,
          entity_type: "master_request",
          entity_id: request.id,
        });
      }

      setSent(true);
    } catch (err) {
      console.error("Erro ao enviar requisição:", err);
      alert("Erro ao enviar requisição. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <Button variant="ghost" size={size} disabled className={`gap-2 text-emerald-600 ${className}`}>
        <Check className="w-3.5 h-3.5" /> Requisição enviada
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRequest}
      disabled={sending}
      className={`gap-2 ${className}`}
    >
      {sending ? (
        <><Send className="w-3.5 h-3.5 animate-pulse" /> Enviando...</>
      ) : (
        <><ShieldAlert className="w-3.5 h-3.5" /> {label}</>
      )}
    </Button>
  );
}

function getDefaultDescription(actionType, entityName) {
  const name = entityName || "item";
  switch (actionType) {
    case "delete_client": return `Excluir cliente: ${name}`;
    case "delete_project": return `Excluir projeto: ${name}`;
    case "delete_collaborator": return `Excluir colaborador: ${name}`;
    case "download_report": return "Baixar relatório operacional (.md)";
    case "download_blueprint": return "Baixar blueprint do sistema (.md)";
    default: return `Ação: ${name}`;
  }
}