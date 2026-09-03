import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Loader2, ChevronDown, X } from "lucide-react";

export default function SendTaskForm({ currentCollab, onTaskSent }) {
  const [collaborators, setCollaborators] = useState([]);
  const [selectedCollab, setSelectedCollab] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    base44.entities.Collaborator.filter({ is_active: true }, "name", 200)
      .then(list => setCollaborators(list.filter(c => c.id !== currentCollab?.id)));
  }, [currentCollab?.id]);

  const filtered = collaborators.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || !selectedCollab) return;
    setSending(true);
    await base44.entities.MiniTask.create({
      title: text.trim(),
      collaborator_id: selectedCollab.id,
      collaborator_name: selectedCollab.name,
      sender_id: currentCollab.id,
      sender_name: currentCollab.name,
      sender_access_level: currentCollab.access_level || "collaborator",
      is_completed: false,
    });
    onTaskSent?.();
    setText("");
    setSelectedCollab(null);
    setSending(false);
  }

  return (
    <form onSubmit={handleSend} className="px-3 py-2 border-b border-border space-y-2">
      {/* Collaborator selector */}
      <div className="relative">
        {selectedCollab ? (
          <div className="flex items-center gap-2 bg-primary/10 rounded-lg px-2.5 py-1.5">
            <Send className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="text-[11px] font-semibold text-primary flex-1 truncate">
              Para: {selectedCollab.name}
            </span>
            <button type="button" onClick={() => setSelectedCollab(null)} className="text-primary/60 hover:text-primary no-touch-min p-0.5">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDropdown(v => !v)}
            className="w-full flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors no-touch-min"
          >
            <Send className="w-3 h-3 flex-shrink-0" />
            <span className="flex-1 text-left">Enviar tarefa para...</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        )}

        {showDropdown && !selectedCollab && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-20 max-h-48 overflow-hidden flex flex-col">
            <div className="px-2 py-1.5 border-b border-border">
              <input
                type="text"
                placeholder="Buscar colaborador..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-36">
              {filtered.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-3">Nenhum encontrado</p>
              ) : (
                filtered.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCollab(c); setShowDropdown(false); setSearch(""); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors no-touch-min"
                  >
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                      style={{ backgroundColor: c.color || "hsl(var(--primary))" }}>
                      {c.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-medium text-foreground truncate block">{c.name}</span>
                      {c.role && <span className="text-[9px] text-muted-foreground">{c.role}</span>}
                    </div>
                    {c.access_level === "admin" && (
                      <span className="text-[8px] bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 px-1 py-0.5 rounded font-bold">ADM</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Text + send */}
      {selectedCollab && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Descreva a tarefa..."
            value={text}
            onChange={e => setText(e.target.value)}
            className="flex-1 bg-muted/50 rounded-lg px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 no-touch-min"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </form>
  );
}