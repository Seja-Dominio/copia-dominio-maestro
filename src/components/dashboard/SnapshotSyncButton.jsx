import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { invokeSnapshotSync } from "@/api/supabaseClient";
import { toast } from "@/components/ui/use-toast";

const SNAPSHOT_ENTITIES = [
  { key: "Client", label: "clientes" },
  { key: "Project", label: "projetos" },
  { key: "Job", label: "jobs" },
  { key: "Subtask", label: "tarefas" },
  { key: "JobHistory", label: "históricos" },
  { key: "AgendaEvent", label: "agenda" },
  { key: "Collaborator", label: "colaboradores" },
];

export default function SnapshotSyncButton() {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [currentEntity, setCurrentEntity] = useState("");

  const handleSync = async () => {
    const confirmed = window.confirm(
      "Sincronizar o snapshot do Prod para o Dev? Clientes, projetos, jobs, tarefas e históricos serão atualizados somente no Dev. Nenhum registro será apagado e o Prod não será alterado.",
    );
    if (!confirmed) return;

    setLoading(true);
    setCompleted(0);
    try {
      const results = [];
      for (let index = 0; index < SNAPSHOT_ENTITIES.length; index += 1) {
        const entity = SNAPSHOT_ENTITIES[index];
        setCurrentEntity(entity.label);
        const result = await invokeSnapshotSync({ force: true, entities: [entity.key] });
        results.push(result);
        setCompleted(index + 1);
      }
      const total = results.flatMap((result) => result?.summary || [])
        .reduce((sum, row) => sum + Number(row.prod || 0), 0);
      toast({
        title: "Snapshot concluído",
        description: `${total.toLocaleString("pt-BR")} registros sincronizados no Dev. O Prod não foi alterado.`,
      });
    } catch (error) {
      toast({
        title: "Snapshot não concluído",
        description: error?.message || "Verifique a configuração da sincronização Prod → Dev.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setCurrentEntity("");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={handleSync} disabled={loading} className="h-8 gap-2 text-xs">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
        {loading ? "Sincronizando…" : "Snapshot Prod → Dev"}
      </Button>
      {loading && (
        <div className="w-full max-w-56 space-y-1" aria-live="polite">
          <div className="flex justify-between gap-2 text-[10px] text-muted-foreground">
            <span>Atualizando {currentEntity}…</span>
            <span>{completed}/{SNAPSHOT_ENTITIES.length}</span>
          </div>
          <Progress value={(completed / SNAPSHOT_ENTITIES.length) * 100} className="h-1.5" />
        </div>
      )}
    </div>
  );
}
