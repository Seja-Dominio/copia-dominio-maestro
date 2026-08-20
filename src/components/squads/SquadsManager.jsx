import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, Users, GripVertical, X, Check, UserPlus } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import SquadMemberPicker from "./SquadMemberPicker";

const SQUAD_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#f97316", "#ef4444", "#6366f1", "#14b8a6",
];

export default function SquadsManager() {
  const [squads, setSquads] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SQUAD_COLORS[0]);
  const [pickerSquadId, setPickerSquadId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [s, c] = await Promise.all([
      base44.entities.Squad.list("name", 100),
      base44.entities.Collaborator.list("name", 200),
    ]);
    setSquads(s);
    setCollaborators(c.filter(col => col.is_active !== false));
    setLoading(false);
  }

  async function createSquad() {
    if (!newName.trim()) return;
    const created = await base44.entities.Squad.create({
      name: newName.trim(),
      color: newColor,
      members: [],
      is_active: true,
    });
    setSquads(prev => [...prev, created]);
    setNewName("");
    setNewColor(SQUAD_COLORS[(squads.length + 1) % SQUAD_COLORS.length]);
    setShowNew(false);
  }

  async function renameSquad(id) {
    if (!editName.trim()) return;
    await base44.entities.Squad.update(id, { name: editName.trim() });
    setSquads(prev => prev.map(s => s.id === id ? { ...s, name: editName.trim() } : s));
    setEditingId(null);
  }

  async function deleteSquad(id) {
    if (!window.confirm("Excluir este squad?")) return;
    await base44.entities.Squad.delete(id);
    setSquads(prev => prev.filter(s => s.id !== id));
  }

  async function removeMember(squadId, collabId) {
    const squad = squads.find(s => s.id === squadId);
    const updatedMembers = (squad.members || []).filter(m => m.collaborator_id !== collabId);
    await base44.entities.Squad.update(squadId, { members: updatedMembers });
    setSquads(prev => prev.map(s => s.id === squadId ? { ...s, members: updatedMembers } : s));
  }

  async function addMembers(squadId, selectedIds) {
    const squad = squads.find(s => s.id === squadId);
    const existing = (squad.members || []).map(m => m.collaborator_id);
    const newMembers = selectedIds
      .filter(id => !existing.includes(id))
      .map(id => {
        const c = collaborators.find(col => col.id === id);
        return { collaborator_id: id, collaborator_name: c?.name || "" };
      });
    const updatedMembers = [...(squad.members || []), ...newMembers];
    await base44.entities.Squad.update(squadId, { members: updatedMembers });
    setSquads(prev => prev.map(s => s.id === squadId ? { ...s, members: updatedMembers } : s));
    setPickerSquadId(null);
  }

  function onDragEnd(result) {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceSquad = squads.find(s => s.id === source.droppableId);
    const destSquad = squads.find(s => s.id === destination.droppableId);
    if (!sourceSquad || !destSquad) return;

    const sourceMembers = [...(sourceSquad.members || [])];
    const [moved] = sourceMembers.splice(source.index, 1);

    if (source.droppableId === destination.droppableId) {
      // Reorder within same squad
      sourceMembers.splice(destination.index, 0, moved);
      base44.entities.Squad.update(sourceSquad.id, { members: sourceMembers });
      setSquads(prev => prev.map(s => s.id === sourceSquad.id ? { ...s, members: sourceMembers } : s));
    } else {
      // Move to different squad — check for duplicate
      const destMembers = [...(destSquad.members || [])];
      if (destMembers.some(m => m.collaborator_id === moved.collaborator_id)) return;
      destMembers.splice(destination.index, 0, moved);
      Promise.all([
        base44.entities.Squad.update(sourceSquad.id, { members: sourceMembers }),
        base44.entities.Squad.update(destSquad.id, { members: destMembers }),
      ]);
      setSquads(prev => prev.map(s => {
        if (s.id === sourceSquad.id) return { ...s, members: sourceMembers };
        if (s.id === destSquad.id) return { ...s, members: destMembers };
        return s;
      }));
    }
  }

  const getCollabColor = (collabId) => {
    const c = collaborators.find(col => col.id === collabId);
    return c?.color || "#94a3b8";
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card p-6 h-40 animate-pulse">
              <div className="h-5 bg-muted rounded w-1/3 mb-4" />
              <div className="h-4 bg-muted rounded w-2/3 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Squads</h1>
          <p className="text-sm text-muted-foreground mt-1">Organize os colaboradores em times. Arraste membros entre squads.</p>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> Novo Squad
        </Button>
      </div>

      {/* New squad form */}
      {showNew && (
        <div className="glass-card p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="flex-1 w-full sm:w-auto">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do Squad</label>
            <Input
              placeholder="Ex: Criação, Tráfego, Audiovisual..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createSquad()}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Cor</label>
            <div className="flex gap-1.5">
              {SQUAD_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center no-touch-min"
                  style={{ backgroundColor: c, borderColor: newColor === c ? "#000" : "transparent" }}
                  onClick={() => setNewColor(c)}
                >
                  {newColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={createSquad} disabled={!newName.trim()}>Criar</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowNew(false); setNewName(""); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {squads.length === 0 && !showNew && (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Nenhum squad criado ainda</p>
          <Button className="mt-4 gap-2" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" /> Criar primeiro squad
          </Button>
        </div>
      )}

      {/* Squads grid with DnD */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {squads.map(squad => (
            <div key={squad.id} className="glass-card overflow-hidden">
              {/* Squad header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border" style={{ borderTopWidth: 3, borderTopColor: squad.color || "#3b82f6" }}>
                {editingId === squad.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") renameSquad(squad.id); if (e.key === "Escape") setEditingId(null); }}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" onClick={() => renameSquad(squad.id)} className="h-7 w-7 p-0 no-touch-min">
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-7 w-7 p-0 no-touch-min">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{squad.name}</span>
                      <Badge variant="secondary" className="text-xs">{(squad.members || []).length}</Badge>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setPickerSquadId(squad.id)} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground no-touch-min" title="Adicionar membro">
                        <UserPlus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setEditingId(squad.id); setEditName(squad.name); }} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground no-touch-min" title="Renomear">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteSquad(squad.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500 no-touch-min" title="Excluir squad">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Droppable member list */}
              <Droppable droppableId={squad.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[80px] p-2 transition-colors ${snapshot.isDraggingOver ? "bg-primary/5" : ""}`}
                  >
                    {(squad.members || []).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">Arraste membros para cá</p>
                    )}
                    {(squad.members || []).map((member, idx) => (
                      <Draggable key={member.collaborator_id} draggableId={member.collaborator_id + "_" + squad.id} index={idx}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-2 px-3 py-2 mb-1 rounded-lg border border-border bg-card group transition-shadow ${
                              snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30" : ""
                            }`}
                          >
                            <span {...provided.dragHandleProps} className="cursor-grab text-muted-foreground no-touch-min flex items-center">
                              <GripVertical className="w-4 h-4" />
                            </span>
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ backgroundColor: getCollabColor(member.collaborator_id) }}
                            >
                              {member.collaborator_name?.[0]?.toUpperCase() || "?"}
                            </div>
                            <span className="text-sm font-medium text-foreground flex-1 truncate">{member.collaborator_name}</span>
                            <button
                              onClick={() => removeMember(squad.id, member.collaborator_id)}
                              className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 transition-opacity no-touch-min"
                              title="Remover"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* Member picker modal */}
      {pickerSquadId && (
        <SquadMemberPicker
          squad={squads.find(s => s.id === pickerSquadId)}
          collaborators={collaborators}
          allSquads={squads}
          onAdd={(ids) => addMembers(pickerSquadId, ids)}
          onClose={() => setPickerSquadId(null)}
        />
      )}
    </div>
  );
}