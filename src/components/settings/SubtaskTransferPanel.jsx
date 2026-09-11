import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, Users } from "lucide-react";
import { maestro, transferSubtasks } from "@/api/maestroClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function isTransferable(subtask, sourceId) {
  if (subtask.responsible_id !== sourceId || subtask.is_completed === true) return false;
  return String(subtask.status || "pending").trim().toLowerCase() !== "completed";
}

export default function SubtaskTransferPanel() {
  const [collaborators, setCollaborators] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      maestro.entities.Collaborator.list("name", 200),
      maestro.entities.Subtask.list("-created_date", 5000),
    ]).then(([loadedCollaborators, loadedSubtasks]) => {
      if (!mounted) return;
      setCollaborators(loadedCollaborators.filter((collaborator) => collaborator.is_active !== false));
      setSubtasks(loadedSubtasks);
    }).catch(() => {
      if (mounted) setFeedback({ type: "error", text: "Não foi possível carregar os colaboradores e subtasks." });
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const transferableCount = useMemo(
    () => subtasks.filter((subtask) => isTransferable(subtask, sourceId)).length,
    [subtasks, sourceId],
  );

  async function handleTransfer() {
    if (!sourceId || !targetId || sourceId === targetId || transferableCount === 0) return;
    setTransferring(true);
    setFeedback(null);
    try {
      const result = await transferSubtasks({ sourceUserId: sourceId, targetUserId: targetId });
      const updatedCount = Number(result?.data?.updatedCount ?? result?.updatedCount ?? 0);
      setSubtasks((current) => current.map((subtask) => (
        isTransferable(subtask, sourceId)
          ? { ...subtask, responsible_id: targetId, responsible_name: collaborators.find((c) => c.id === targetId)?.name || "" }
          : subtask
      )));
      setFeedback({ type: "success", text: `${updatedCount} subtask${updatedCount === 1 ? " transferida" : "s transferidas"} para o novo responsável.` });
    } catch (error) {
      setFeedback({ type: "error", text: error.message || "Não foi possível transferir as subtasks." });
    } finally {
      setTransferring(false);
    }
  }

  if (loading) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">Carregando configuração de transferência...</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          Transferir subtasks
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Troque o responsável em massa. Apenas subtarefas abertas serão transferidas; tarefas concluídas permanecem com o responsável atual.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
          <label className="space-y-1.5 text-sm font-medium">
            De
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecione o responsável atual</option>
              {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name || collaborator.full_name}</option>)}
            </select>
          </label>
          <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
          <label className="space-y-1.5 text-sm font-medium">
            Para
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Selecione o novo responsável</option>
              {collaborators.filter((collaborator) => collaborator.id !== sourceId).map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name || collaborator.full_name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground"><strong className="text-foreground">{transferableCount}</strong> subtask{transferableCount === 1 ? " pendente/em andamento" : "s pendentes/em andamento"} será{transferableCount === 1 ? "" : "ão"} transferida{transferableCount === 1 ? "" : "s"}.</span>
          <Button onClick={handleTransfer} disabled={transferring || !sourceId || !targetId || sourceId === targetId || transferableCount === 0} size="sm" className="gap-2">
            {transferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {transferring ? "Transferindo..." : "Transferir subtasks"}
          </Button>
        </div>

        {feedback && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {feedback.type === "success" && <CheckCircle2 className="h-4 w-4" />}
            {feedback.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
