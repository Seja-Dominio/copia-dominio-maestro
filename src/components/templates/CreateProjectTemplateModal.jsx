import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Trash2 } from "lucide-react";

export default function CreateProjectTemplateModal({ onClose, onCreate, editingTemplate }) {
  const [name, setName] = useState(editingTemplate?.name || "");
  const [jobTemplates, setJobTemplates] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState(
    editingTemplate?.jobs?.map(j => j.job_template_id) || []
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.JobTemplate.list("name", 100).then(setJobTemplates);
  }, []);

  function toggleJob(id) {
    setSelectedJobs(prev =>
      prev.includes(id) ? prev.filter(j => j !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const jobs = selectedJobs.map((id, i) => {
      const jt = jobTemplates.find(j => j.id === id);
      return { job_template_id: id, job_template_name: jt?.name || "", order: i };
    });
    const payload = { name: name.trim(), jobs };
    let result;
    if (editingTemplate) {
      result = await base44.entities.ProjectTemplate.update(editingTemplate.id, payload);
    } else {
      result = await base44.entities.ProjectTemplate.create(payload);
    }
    onCreate(result);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-bold text-foreground">
            {editingTemplate ? "Editar Template de Projeto" : "Novo Template de Projeto"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do Template *</label>
            <Input
              placeholder="Ex: Projeto Social Media Padrão"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Templates de Job incluídos</label>
            {jobTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum template de job cadastrado ainda.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {jobTemplates.map(jt => {
                  const selected = selectedJobs.includes(jt.id);
                  return (
                    <button
                      key={jt.id}
                      type="button"
                      onClick={() => toggleJob(jt.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        selected
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected ? "bg-primary border-primary" : "border-border"}`}>
                        {selected && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{jt.name}</p>
                        <p className="text-xs text-muted-foreground">{jt.subtasks?.length || 0} tarefa(s)</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedJobs.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">{selectedJobs.length} job(s) selecionado(s)</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Salvando..." : editingTemplate ? "Salvar" : "Criar Template"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}