import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Save, Trash2 } from "lucide-react";
import { useConfirmDelete } from "@/components/ConfirmDeleteContext";
import { safeDelete } from "@/lib/safeDelete";
import { Button } from "@/components/ui/button";
import StandardDrawer from "@/components/ui/StandardDrawer";

export default function TimesheetEditModal({ timesheet, collaborators, onClose, onSaved, onDeleted, isAdmin }) {
  const [form, setForm] = useState({
    collaborator_id: timesheet?.collaborator_id || "",
    collaborator_name: timesheet?.collaborator_name || "",
    duration_minutes: timesheet?.duration_minutes || 0,
    started_at: timesheet?.started_at ? timesheet.started_at.slice(0, 16) : new Date().toISOString().slice(0, 16),
    is_rework: timesheet?.is_rework || false,
    notes: timesheet?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = useConfirmDelete();

  const hours = Math.floor(form.duration_minutes / 60);
  const mins = form.duration_minutes % 60;

  function setDuration(h, m) {
    setForm(f => ({ ...f, duration_minutes: (parseInt(h) || 0) * 60 + (parseInt(m) || 0) }));
  }

  function setCollab(id) {
    const c = collaborators.find(x => x.id === id);
    setForm(f => ({ ...f, collaborator_id: id, collaborator_name: c?.name || "" }));
  }

  async function handleSave() {
    setSaving(true);
    const data = {
      collaborator_id: form.collaborator_id,
      collaborator_name: form.collaborator_name,
      duration_minutes: form.duration_minutes,
      started_at: new Date(form.started_at).toISOString(),
      is_rework: form.is_rework,
      notes: form.notes,
    };
    if (timesheet?.id) {
      await base44.entities.Timesheet.update(timesheet.id, data);
    } else {
      await base44.entities.Timesheet.create({
        ...data,
        job_id: timesheet.job_id,
        job_title: timesheet.job_title,
        project_id: timesheet.project_id,
        project_name: timesheet.project_name,
        client_id: timesheet.client_id,
        client_name: timesheet.client_name,
        is_running: false,
        status: "approved",
        ended_at: new Date().toISOString(),
      });
    }
    setSaving(false);
    onSaved?.();
    onClose();
  }

  async function handleDelete() {
    if (!timesheet?.id) return;
    const confirmed = await confirmDelete({ title: "Excluir apontamento?", message: "Este registro de horas será permanentemente removido." });
    if (!confirmed) return;
    setDeleting(true);
    await safeDelete("timesheet", "Timesheet", timesheet);
    setDeleting(false);
    onDeleted?.();
    onClose();
  }

  const drawerFooter = (
    <div className="flex gap-2">
      {isAdmin && timesheet?.id && (
        <Button
          variant="outline"
          size="icon"
          onClick={handleDelete}
          disabled={deleting}
          className="text-destructive hover:bg-destructive/10 border-destructive/30 flex-shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
      <Button variant="outline" className="flex-1 h-9 text-sm" onClick={onClose}>Cancelar</Button>
      <Button className="flex-1 h-9 text-sm" onClick={handleSave} disabled={saving || !form.collaborator_id || !form.duration_minutes}>
        <Save className="w-4 h-4" />
        {saving ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );

  return (
    <StandardDrawer open={true} onClose={onClose} title={timesheet?.id ? "Editar Apontamento" : "Novo Apontamento"} width={400} footer={drawerFooter}>
        <div className="px-5 py-4 space-y-4">
          {/* Collaborator */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Colaborador</label>
            <select
              value={form.collaborator_id}
              onChange={e => setCollab(e.target.value)}
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— Selecionar —</option>
              {collaborators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Duração</label>
            <div className="flex gap-2 items-center">
              <input
                type="number" min="0" max="99" placeholder="0"
                value={hours}
                onChange={e => setDuration(e.target.value, mins)}
                className="h-9 w-20 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">h</span>
              <input
                type="number" min="0" max="59" placeholder="0"
                value={mins}
                onChange={e => setDuration(hours, e.target.value)}
                className="h-9 w-20 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>

          {/* Date/time */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Data e Hora</label>
            <input
              type="datetime-local"
              value={form.started_at}
              onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))}
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Rework toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setForm(f => ({ ...f, is_rework: !f.is_rework }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                form.is_rework
                  ? "bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  : "bg-muted border-border text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Retrabalho {form.is_rework ? "✓" : ""}
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Observações</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full h-16 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              placeholder="Opcional..."
            />
          </div>
        </div>
    </StandardDrawer>
  );
}