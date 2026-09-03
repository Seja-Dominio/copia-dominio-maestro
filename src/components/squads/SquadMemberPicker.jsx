import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Check } from "lucide-react";

export default function SquadMemberPicker({ squad, collaborators, allSquads, onAdd, onClose }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);

  const existingIds = (squad?.members || []).map(m => m.collaborator_id);

  // Find which squad each collaborator belongs to
  const collabSquadMap = {};
  allSquads.forEach(s => {
    (s.members || []).forEach(m => {
      if (!collabSquadMap[m.collaborator_id]) collabSquadMap[m.collaborator_id] = [];
      collabSquadMap[m.collaborator_id].push(s.name);
    });
  });

  const available = collaborators.filter(c =>
    !existingIds.includes(c.id) &&
    (!search || c.name?.toLowerCase().includes(search.toLowerCase()))
  );

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Adicionar membros ao {squad?.name}</h3>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {available.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum colaborador disponível</p>
          )}
          {available.map(c => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                selected.includes(c.id) ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"
              }`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: c.color || "#94a3b8" }}
              >
                {c.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{c.role || "Sem cargo"}</span>
                  {collabSquadMap[c.id]?.map(sn => (
                    <Badge key={sn} variant="secondary" className="text-[10px] py-0 px-1.5">{sn}</Badge>
                  ))}
                </div>
              </div>
              {selected.includes(c.id) && (
                <Check className="w-5 h-5 text-primary flex-shrink-0" />
              )}
            </button>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={selected.length === 0} onClick={() => onAdd(selected)}>
            Adicionar {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}