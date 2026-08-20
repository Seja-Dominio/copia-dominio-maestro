import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Plus, Trash2, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const DEFAULT_ROLES = [
  "Designer Gráfico",
  "Editor de Vídeo",
  "Social Media",
  "Redator",
  "Atendimento",
  "Gestor de Tráfego",
  "Fotógrafo",
  "Diretor de Arte",
];

export default function RolesConfig() {
  const [roles, setRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadRoles();
  }, []);

  async function loadRoles() {
    const configs = await base44.entities.AppConfig.filter({ key: "collaborator_roles" });
    if (configs.length > 0 && configs[0].value?.roles?.length > 0) {
      setRoles(configs[0].value.roles);
    } else {
      setRoles(DEFAULT_ROLES);
    }
  }

  function handleDragEnd(result) {
    if (!result.destination) return;
    const next = Array.from(roles);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setRoles(next);
  }

  function updateRole(index, value) {
    setRoles(prev => prev.map((r, i) => i === index ? value : r));
  }

  function addRole() {
    setRoles(prev => [...prev, ""]);
  }

  function removeRole(index) {
    setRoles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    const filteredRoles = roles.filter(r => r.trim() !== "");
    const existing = await base44.entities.AppConfig.filter({ key: "collaborator_roles" });
    if (existing.length > 0) {
      await base44.entities.AppConfig.update(existing[0].id, { key: "collaborator_roles", value: { roles: filteredRoles } });
    } else {
      await base44.entities.AppConfig.create({ key: "collaborator_roles", value: { roles: filteredRoles } });
    }
    setRoles(filteredRoles);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Cargos / Funções</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure os cargos disponíveis para seleção no cadastro de colaboradores.
        </p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="roles">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
              {roles.map((role, index) => (
                <Draggable key={`role-${index}`} draggableId={`role-${index}`} index={index}>
                  {(prov, snapshot) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      className={`flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2 transition-shadow ${
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
                      }`}
                    >
                      <div {...prov.dragHandleProps} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                        <GripVertical className="w-4 h-4" />
                      </div>

                      <Input
                        value={role}
                        onChange={e => updateRole(index, e.target.value)}
                        className="flex-1 h-9 text-sm"
                        placeholder="Nome do cargo"
                      />

                      <button
                        onClick={() => removeRole(index)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                        title="Remover cargo"
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

      <button
        onClick={addRole}
        className="mt-3 flex items-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/40 transition-all"
      >
        <Plus className="w-4 h-4 mx-auto" />
        <span>Adicionar cargo</span>
      </button>

      <div className="flex gap-3 mt-6">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saved ? "Salvo!" : saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}

// Hook para usar lista de cargos em outros componentes
export async function fetchRolesList() {
  const configs = await base44.entities.AppConfig.filter({ key: "collaborator_roles" });
  if (configs.length > 0 && configs[0].value?.roles?.length > 0) {
    return configs[0].value.roles;
  }
  return DEFAULT_ROLES;
}