import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, ShieldX, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Panel for masters to view and approve/reject pending requests from gestores.
 */
export default function MasterRequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    base44.entities.MasterRequest.list("-created_date", 100).then(r => {
      setRequests(r);
    }).finally(() => setLoading(false));
  }, []);

  const session = sessionStorage.getItem("collaborator");
  const currentUser = session ? JSON.parse(session) : null;

  const handleAction = async (request, approved) => {
    setProcessing(request.id);
    try {
      await base44.entities.MasterRequest.update(request.id, {
        status: approved ? "approved" : "rejected",
        resolved_by: currentUser?.id,
        resolved_by_name: currentUser?.name,
        resolved_at: new Date().toISOString(),
      });

      // Notify requester
      await base44.entities.Notification.create({
        user_id: request.requester_id,
        type: approved ? "request_approved" : "request_rejected",
        title: approved ? "Requisição aprovada ✓" : "Requisição recusada",
        message: approved
          ? `Sua solicitação "${request.description}" foi aprovada por ${currentUser?.name}.`
          : `Sua solicitação "${request.description}" foi recusada por ${currentUser?.name}.`,
        entity_type: "master_request",
        entity_id: request.id,
      });

      // If approved and it's a delete action, execute it
      if (approved && request.entity_id) {
        try {
          if (request.action_type === "delete_client" && request.entity_id) {
            await base44.entities.Client.delete(request.entity_id);
          } else if (request.action_type === "delete_project" && request.entity_id) {
            await base44.entities.Project.delete(request.entity_id);
          } else if (request.action_type === "delete_collaborator" && request.entity_id) {
            await base44.entities.Collaborator.update(request.entity_id, { is_active: false });
          }
        } catch (err) {
          console.error("Erro ao executar ação aprovada:", err);
        }
      }

      setRequests(prev => prev.map(r => r.id === request.id ? {
        ...r,
        status: approved ? "approved" : "rejected",
        resolved_by_name: currentUser?.name,
        resolved_at: new Date().toISOString(),
      } : r));
    } catch (err) {
      console.error("Erro ao processar requisição:", err);
    } finally {
      setProcessing(null);
    }
  };

  const pending = requests.filter(r => r.status === "pending");
  const resolved = requests.filter(r => r.status !== "pending");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-foreground uppercase flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-500" /> Pendentes ({pending.length})
          </h4>
          <div className="space-y-2">
            {pending.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{r.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Por: {r.requester_name} • {r.created_date ? format(parseISO(r.created_date), "dd/MM HH:mm", { locale: ptBR }) : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-3 text-[10px] gap-1"
                    onClick={() => handleAction(r, true)}
                    disabled={processing === r.id}
                  >
                    <ShieldCheck className="w-3 h-3" /> Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 px-3 text-[10px] gap-1"
                    onClick={() => handleAction(r, false)}
                    disabled={processing === r.id}
                  >
                    <ShieldX className="w-3 h-3" /> Recusar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground uppercase">Resolvidas ({resolved.length})</h4>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {resolved.slice(0, 30).map(r => (
              <div key={r.id} className={`flex items-center gap-3 p-2.5 rounded-lg ${r.status === "approved" ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-red-50 dark:bg-red-900/10"}`}>
                {r.status === "approved" ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" /> : <ShieldX className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-foreground truncate">{r.description}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {r.requester_name} → {r.status === "approved" ? "Aprovado" : "Recusado"} por {r.resolved_by_name}
                    {r.resolved_at && ` • ${format(parseISO(r.resolved_at), "dd/MM HH:mm", { locale: ptBR })}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && resolved.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Nenhuma requisição registrada.
        </div>
      )}
    </div>
  );
}