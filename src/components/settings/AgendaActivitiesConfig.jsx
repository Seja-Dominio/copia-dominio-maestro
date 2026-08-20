import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_ACTIVITY_CONFIG } from "@/pages/Agenda";

const PRESET_COLORS = [
  "#7c3aed","#3b82f6","#06b6d4","#22c55e","#f59e0b",
  "#f97316","#ec4899","#ef4444","#8b5cf6","#14b8a6",
  "#64748b","#9ca3af",
  "#e11d48","#0891b2","#4f46e5","#16a34a","#ca8a04",
  "#dc2626","#9333ea","#0d9488","#2563eb","#c026d3",
  "#059669","#d97706","#6366f1","#be185d","#475569",
];



function colorToTailwind(hex) {
  const map = {
    "#7c3aed": { color: "bg-violet-100 text-violet-700 border-violet-200", dot: "bg-violet-500" },
    "#3b82f6": { color: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
    "#06b6d4": { color: "bg-cyan-100 text-cyan-700 border-cyan-200",        dot: "bg-cyan-500" },
    "#22c55e": { color: "bg-green-100 text-green-700 border-green-200",     dot: "bg-green-500" },
    "#f59e0b": { color: "bg-amber-100 text-amber-700 border-amber-200",     dot: "bg-amber-500" },
    "#f97316": { color: "bg-orange-100 text-orange-700 border-orange-200",  dot: "bg-orange-500" },
    "#ec4899": { color: "bg-pink-100 text-pink-700 border-pink-200",        dot: "bg-pink-500" },
    "#ef4444": { color: "bg-red-100 text-red-700 border-red-200",           dot: "bg-red-500" },
    "#8b5cf6": { color: "bg-purple-100 text-purple-700 border-purple-200",  dot: "bg-purple-500" },
    "#14b8a6": { color: "bg-teal-100 text-teal-700 border-teal-200",        dot: "bg-teal-500" },
    "#64748b": { color: "bg-slate-100 text-slate-700 border-slate-200",     dot: "bg-slate-500" },
    "#9ca3af": { color: "bg-gray-100 text-gray-600 border-gray-200",        dot: "bg-gray-400" },
    "#e11d48": { color: "bg-rose-100 text-rose-700 border-rose-200",        dot: "bg-rose-600" },
    "#0891b2": { color: "bg-cyan-100 text-cyan-800 border-cyan-300",        dot: "bg-cyan-600" },
    "#4f46e5": { color: "bg-indigo-100 text-indigo-700 border-indigo-200",  dot: "bg-indigo-600" },
    "#16a34a": { color: "bg-green-100 text-green-800 border-green-300",     dot: "bg-green-600" },
    "#ca8a04": { color: "bg-yellow-100 text-yellow-700 border-yellow-200",  dot: "bg-yellow-600" },
    "#dc2626": { color: "bg-red-100 text-red-800 border-red-300",           dot: "bg-red-600" },
    "#9333ea": { color: "bg-purple-100 text-purple-800 border-purple-300",  dot: "bg-purple-600" },
    "#0d9488": { color: "bg-teal-100 text-teal-800 border-teal-300",        dot: "bg-teal-600" },
    "#2563eb": { color: "bg-blue-100 text-blue-800 border-blue-300",        dot: "bg-blue-600" },
    "#c026d3": { color: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200", dot: "bg-fuchsia-600" },
    "#059669": { color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-600" },
    "#d97706": { color: "bg-amber-100 text-amber-800 border-amber-300",     dot: "bg-amber-600" },
    "#6366f1": { color: "bg-indigo-100 text-indigo-800 border-indigo-300",  dot: "bg-indigo-500" },
    "#be185d": { color: "bg-pink-100 text-pink-800 border-pink-300",        dot: "bg-pink-700" },
    "#475569": { color: "bg-slate-100 text-slate-800 border-slate-300",     dot: "bg-slate-600" },
  };
  return map[hex] || { color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" };
}

export default function AgendaActivitiesConfig() {
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem("agendaActivityConfig") || "null"); } catch { return null; }
  })();
  const [activities, setActivities] = useState(stored || Object.entries(DEFAULT_ACTIVITY_CONFIG).map(([key, v]) => ({ key, ...v })));
  const [editingKey, setEditingKey] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editDuration, setEditDuration] = useState(60);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newDuration, setNewDuration] = useState(60);





  function save(updated) {
    setActivities(updated);
    localStorage.setItem("agendaActivityConfig", JSON.stringify(updated));
  }



  function startEdit(act) {
    setEditingKey(act.key);
    setEditLabel(act.label);
    setEditColor(act.hex);
    setEditDuration(act.default_duration || 60);
  }

  function confirmEdit() {
    const updated = activities.map(a => a.key === editingKey ? { ...a, label: editLabel, hex: editColor, default_duration: editDuration, ...colorToTailwind(editColor) } : a);
    save(updated);
    setEditingKey(null);
  }

  function deleteActivity(key) {
    save(activities.filter(a => a.key !== key));
  }

  function addActivity() {
    if (!newLabel || !newKey) return;
    const key = newKey.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    if (activities.find(a => a.key === key)) return;
    const tw = colorToTailwind(newColor);
    save([...activities, { key, label: newLabel, hex: newColor, default_duration: newDuration, ...tw }]);
    setAdding(false);
    setNewKey("");
    setNewLabel("");
    setNewColor(PRESET_COLORS[0]);
    setNewDuration(60);
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h2 className="text-base font-bold text-foreground">Configurações da Agenda</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Configure o setor, tipos de atividade e cores da agenda empresarial.</p>
      </div>

      {/* Atividades */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atividades</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAdding(true)}>
            <Plus className="w-3 h-3" /> Nova atividade
          </Button>
        </div>

        <div className="divide-y divide-border">
          {activities.map(act => (
            <div key={act.key} className="px-5 py-3 flex items-center gap-3">
              {editingKey === act.key ? (
                <>
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    className="flex-1 h-8 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={editDuration}
                      onChange={e => setEditDuration(Number(e.target.value))}
                      className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setEditColor(c)}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${editColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <button onClick={confirmEdit} className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingKey(null)} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: act.hex }} />
                  <span className="flex-1 text-sm font-medium text-foreground">{act.label}</span>
                  <span className="text-xs text-muted-foreground font-medium">{act.default_duration || 60} min</span>
                  <button onClick={() => startEdit(act)} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteActivity(act.key)} className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-destructive/60 hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}

          {/* Nova atividade */}
          {adding && (
            <div className="px-5 py-3 flex items-center gap-2 bg-muted/20">
              <input
                autoFocus
                value={newLabel}
                onChange={e => { setNewLabel(e.target.value); setNewKey(e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")); }}
                placeholder="Nome da atividade"
                className="flex-1 h-8 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                onKeyDown={e => { if (e.key === "Enter") addActivity(); if (e.key === "Escape") setAdding(false); }}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={newDuration}
                  onChange={e => setNewDuration(Number(e.target.value))}
                  className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">min</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <button onClick={addActivity} className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setAdding(false)} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}