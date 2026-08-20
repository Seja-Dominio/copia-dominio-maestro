import { useState } from "react";
import { Plus, X, Check, Circle, ChevronDown, ChevronRight } from "lucide-react";

export default function MiniTaskChecklist({ checklist = [], onChange, readOnly }) {
  const [expanded, setExpanded] = useState(false);
  const [newText, setNewText] = useState("");

  const doneCount = checklist.filter(i => i.done).length;
  const totalCount = checklist.length;

  function toggleItem(id) {
    if (readOnly) return;
    const updated = checklist.map(i => i.id === id ? { ...i, done: !i.done } : i);
    onChange(updated);
  }

  function addItem(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!newText.trim() || readOnly) return;
    const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: newText.trim(), done: false };
    onChange([...checklist, item]);
    setNewText("");
  }

  function removeItem(id) {
    onChange(checklist.filter(i => i.id !== id));
  }

  return (
    <div className="mt-1" onClick={e => e.stopPropagation()}>
      {/* Toggle bar */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
        className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground font-medium no-touch-min h-auto min-h-0 min-w-0 py-0.5"
      >
        {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        <span>Checklist {totalCount > 0 && `(${doneCount}/${totalCount})`}</span>
      </button>

      {/* Progress bar */}
      {totalCount > 0 && !expanded && (
        <div className="h-1 bg-muted rounded-full mt-0.5 overflow-hidden w-20">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      )}

      {expanded && (
        <div className="mt-1 space-y-0.5 pl-1">
          {checklist.map(item => (
            <div key={item.id} className="flex items-center gap-1.5 group">
              <button
                onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }}
                className="flex-shrink-0 no-touch-min w-4 h-4 min-h-0 min-w-0 flex items-center justify-center"
                disabled={readOnly}
              >
                {item.done
                  ? <Check className="w-3 h-3 text-green-500" />
                  : <Circle className="w-3 h-3 text-muted-foreground" />}
              </button>
              <span className={`text-[10px] flex-1 leading-snug ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.text}
              </span>
              {!readOnly && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                  className="no-touch-min w-4 h-4 min-h-0 min-w-0 flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <form onSubmit={addItem} className="flex items-center gap-1 mt-0.5">
              <input
                type="text"
                placeholder="Adicionar item..."
                value={newText}
                onChange={e => setNewText(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="flex-1 bg-transparent text-[10px] outline-none placeholder:text-muted-foreground border-b border-transparent focus:border-border py-0.5"
              />
              <button
                type="submit"
                disabled={!newText.trim()}
                onClick={e => e.stopPropagation()}
                className="no-touch-min w-4 h-4 min-h-0 min-w-0 flex items-center justify-center text-primary disabled:opacity-30"
              >
                <Plus className="w-3 h-3" />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}