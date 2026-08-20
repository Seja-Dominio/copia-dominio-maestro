import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

export default function ClientComboField({ value, clients, labelCls, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const ref = useRef(null);

  useEffect(() => { setSearch(value || ""); }, [value]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  function select(c) {
    onChange(c.name, c.id);
    setSearch(c.name);
    setOpen(false);
  }

  function handleInputChange(val) {
    setSearch(val);
    onChange(val, "");
    if (!open) setOpen(true);
  }

  function clear() {
    setSearch("");
    onChange("", "");
  }

  return (
    <div ref={ref} className="relative">
      <label className={labelCls} style={{ marginBottom: "6px" }}>Cliente</label>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Digite ou selecione um cliente"
          className="w-full h-9 rounded-lg border border-input bg-background pl-3 pr-14 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {search && (
            <button type="button" onClick={clear} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted no-touch-min">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
          <button type="button" onClick={() => setOpen(o => !o)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted no-touch-min">
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors no-touch-min"
              style={{ minHeight: "36px" }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}