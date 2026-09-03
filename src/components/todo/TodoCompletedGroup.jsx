import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronRight, Check, Trash2 } from "lucide-react";

export default function TodoCompletedGroup({ day, items, onToggle, onDelete, defaultOpen = false, isExpanded, onToggleExpand }) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);

  // Support both controlled (isExpanded/onToggleExpand) and uncontrolled (defaultOpen) modes
  const controlled = isExpanded !== undefined;
  const isOpen = controlled ? isExpanded : internalOpen;
  const handleToggle = controlled ? onToggleExpand : () => setInternalOpen(v => !v);

  const dayLabel = day === "sem-data"
    ? "Sem data"
    : format(new Date(day + "T12:00:00"), "dd 'de' MMM, yyyy", { locale: ptBR });

  return (
    <div className="mb-1">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-1 py-1 w-full text-left hover:bg-muted/30 rounded no-touch-min"
      >
        <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
        <span className="text-[10px] font-semibold text-muted-foreground">{dayLabel}</span>
        <span className="text-[9px] text-muted-foreground">({items.length})</span>
      </button>

      {isOpen && (
        <div className="ml-3 space-y-0.5">
          {items.map(t => (
            <div key={t.id} className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30">
              <button onClick={() => onToggle(t)} className="no-touch-min w-5 h-5 flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-green-500" />
              </button>
              <span className="text-[11px] text-muted-foreground line-through truncate flex-1">{t.title}</span>
              <button
                onClick={() => onDelete(t)}
                className="text-muted-foreground hover:text-destructive no-touch-min w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}