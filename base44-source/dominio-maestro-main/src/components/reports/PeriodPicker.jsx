import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PeriodPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(value?.start || "");
  const [customEnd, setCustomEnd] = useState(value?.end || "");
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const today = new Date();
  const currentMonthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const currentMonthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const lastMonth = subMonths(today, 1);
  const lastMonthStart = format(startOfMonth(lastMonth), "yyyy-MM-dd");
  const lastMonthEnd = format(endOfMonth(lastMonth), "yyyy-MM-dd");

  const presets = [
    { label: "Mês atual", start: currentMonthStart, end: currentMonthEnd },
    { label: "Mês passado", start: lastMonthStart, end: lastMonthEnd },
  ];

  const label = value
    ? `${format(new Date(value.start + "T12:00:00"), "dd/MM/yyyy")} – ${format(new Date(value.end + "T12:00:00"), "dd/MM/yyyy")}`
    : "Todos os períodos";

  function applyCustom() {
    if (customStart && customEnd) {
      onChange({ start: customStart, end: customEnd });
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors"
      >
        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
        {label}
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-xl p-4 w-72">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-3">Período</p>

          <div className="space-y-1 mb-3">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${!value ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}
            >
              Todos os períodos
            </button>
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => { onChange({ start: p.start, end: p.end }); setOpen(false); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  value?.start === p.start && value?.end === p.end
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Personalizado</p>
            <div className="flex flex-col gap-2">
              <input
                type="date"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={customStart}
                defaultValue={format(today, "yyyy-MM-dd")}
                onChange={e => setCustomStart(e.target.value)}
              />
              <input
                type="date"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={customEnd}
                defaultValue={format(today, "yyyy-MM-dd")}
                onChange={e => setCustomEnd(e.target.value)}
              />
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd}
                className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}