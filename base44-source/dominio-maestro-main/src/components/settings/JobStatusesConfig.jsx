import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { DEFAULT_STATUS_LIST, useStatusConfig } from "@/lib/AppConfigContext";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, RotateCcw, Plus, Trash2, GripVertical, ChevronDown, Bell } from "lucide-react";
import { fetchRolesList } from "@/components/settings/RolesConfig";

const COLOR_OPTIONS = [
  { label: "Âmbar",    color: "bg-amber-100 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
  { label: "Laranja",  color: "bg-orange-100 text-orange-700 border-orange-200",  dot: "bg-orange-500" },
  { label: "Azul",     color: "bg-blue-100 text-blue-700 border-blue-200",         dot: "bg-blue-500" },
  { label: "Roxo",     color: "bg-purple-100 text-purple-700 border-purple-200",   dot: "bg-purple-500" },
  { label: "Ciano",    color: "bg-cyan-100 text-cyan-700 border-cyan-200",         dot: "bg-cyan-500" },
  { label: "Rosa",     color: "bg-pink-100 text-pink-700 border-pink-200",         dot: "bg-pink-500" },
  { label: "Verde",    color: "bg-green-100 text-green-700 border-green-200",      dot: "bg-green-500" },
  { label: "Verde Esc.",color:"bg-emerald-100 text-emerald-700 border-emerald-200",dot: "bg-emerald-600" },
  { label: "Vermelho", color: "bg-red-100 text-red-700 border-red-200",            dot: "bg-red-500" },
  { label: "Índigo",   color: "bg-indigo-100 text-indigo-700 border-indigo-200",   dot: "bg-indigo-500" },
  { label: "Violeta",  color: "bg-violet-100 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  { label: "Cinza",    color: "bg-slate-100 text-slate-700 border-slate-200",      dot: "bg-slate-500" },
];

function ColorPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = COLOR_OPTIONS.find(c => c.dot === value?.dot) || COLOR_OPTIONS[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-input bg-background hover:bg-muted transition-colors"
      >
        <div className={`w-3 h-3 rounded-full ${current.dot}`} />
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-20 bg-popover border border-border rounded-xl shadow-xl p-2 grid grid-cols-4 gap-1.5 w-44">
            {COLOR_OPTIONS.map(opt => (
              <button
                key={opt.dot}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-all hover:scale-110 ${
                  current.dot === opt.dot ? "border-primary" : "border-transparent"
                }`}
                title={opt.label}
              >
                <div className={`w-4 h-4 rounded-full ${opt.dot}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function JobStatusesConfig() {
  const { statusList, refresh } = useStatusConfig();
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);

  useEffect(() => {
    setItems(statusList.map(s => ({ ...s })));
  }, [statusList]);

  useEffect(() => {
    fetchRolesList().then(setRoleOptions);
  }, []);

  function handleDragEnd(result) {
    if (!result.destination) return;
    const next = Array.from(items);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setItems(next);
  }

  function updateItem(index, patch) {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  }

  function addStatus() {
    const colorOpt = COLOR_OPTIONS[items.length % COLOR_OPTIONS.length];
    setItems(prev => [...prev, {
      key: `custom_${Date.now()}`,
      label: "Nova etapa",
      color: colorOpt.color,
      dot: colorOpt.dot,
      _new: true,
    }]);
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    const statuses = items.map(({ _new, ...s }) => s);
    const existing = await base44.entities.AppConfig.filter({ key: "job_statuses_v2" });
    if (existing.length > 0) {
      await base44.entities.AppConfig.update(existing[0].id, { key: "job_statuses_v2", value: { statuses } });
    } else {
      await base44.entities.AppConfig.create({ key: "job_statuses_v2", value: { statuses } });
    }
    await refresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setItems(DEFAULT_STATUS_LIST.map(s => ({ ...s })));
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Etapas de Status dos Jobs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Adicione, remova, renomeie e reordene as etapas arrastando as linhas.
        </p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="statuses">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
              {items.map((item, index) => (
                <Draggable key={item.key} draggableId={item.key} index={index}>
                  {(prov, snapshot) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      className={`flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2 transition-shadow ${
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
                      }`}
                    >
                      {/* Drag handle */}
                      <div {...prov.dragHandleProps} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      {/* Order number */}
                      <span className="text-xs text-muted-foreground font-mono w-4 text-center flex-shrink-0">
                        {index + 1}
                      </span>

                      {/* Color picker */}
                      <ColorPicker
                        value={item}
                        onChange={(opt) => updateItem(index, { color: opt.color, dot: opt.dot })}
                      />

                      {/* Label input */}
                      <Input
                        value={item.label}
                        onChange={e => updateItem(index, { label: e.target.value })}
                        className="flex-1 h-9 text-sm"
                        placeholder="Nome da etapa"
                      />

                      {/* Notify role dropdown */}
                      <div className="relative flex-shrink-0">
                        <select
                          value={item.notify_role || ""}
                          onChange={e => updateItem(index, { notify_role: e.target.value || undefined })}
                          className="h-9 w-40 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none pr-7"
                          title="Notificar cargo ao chegar nesta etapa"
                        >
                          <option value="">Sem notificação</option>
                          {roleOptions.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <Bell className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      </div>

                      {/* Key (readonly for system statuses) */}
                      <span className="text-[10px] text-muted-foreground font-mono truncate w-28 hidden lg:block">
                        {item.key}
                      </span>

                      {/* Delete */}
                      <button
                        onClick={() => removeItem(index)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                        title="Remover etapa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Add button */}
      <button
        onClick={addStatus}
        className="mt-3 flex items-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/40 transition-all"
      >
        <Plus className="w-4 h-4 mx-auto" />
        <span>Adicionar etapa</span>
      </button>

      <div className="flex gap-3 mt-6">
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="w-4 h-4" /> Restaurar padrões
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        ⚠️ Remover uma etapa não altera jobs existentes com aquele status — eles ficam visíveis apenas na tabela.
      </p>
    </div>
  );
}