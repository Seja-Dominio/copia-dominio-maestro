import { createPortal } from "react-dom";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Plus, User, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileSelect } from "@/components/ui/bottom-sheet";

export default function DayEventsModal({ date, events, activityConfig, statusConfig, onClose, onEdit, onAdd, onStatusChange }) {
  if (!date) return null;
  const d = parseISO(date);
  const isToday = date === format(new Date(), "yyyy-MM-dd");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="absolute bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
        style={{ top: "calc(56px + 20px)", left: 20, right: 20, maxHeight: "calc(100vh - 56px - 40px)", maxWidth: 480, margin: "0 auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b border-border flex items-center gap-3 ${isToday ? "bg-primary/5" : "bg-muted/30"}`}>
          <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${isToday ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
            <span className="text-sm font-black leading-none">{format(d, "dd")}</span>
            <span className="text-[10px] uppercase">{format(d, "MMM", { locale: ptBR })}</span>
          </div>
          <div className="flex-1">
            <p className={`text-sm font-bold capitalize ${isToday ? "text-primary" : "text-foreground"}`}>
              {isToday ? "Hoje" : format(d, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
            <p className="text-xs text-muted-foreground">{events.length} evento{events.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onAdd} className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Events */}
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-border">
          {events.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground mb-3">Nenhum evento neste dia</p>
              <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Adicionar evento
              </Button>
            </div>
          ) : (
            events.map(ev => {
              const act = activityConfig[ev.activity_type] || activityConfig.outro || {};
              const st = statusConfig[ev.status] || statusConfig.agendado || {};
              const StatusIcon = st.icon;
              return (
                <div
                  key={ev.id}
                  className="px-5 py-3 flex items-start gap-3 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => onEdit(ev)}
                >
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: act.hex || "#9ca3af" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{ev.title}</p>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${act.color || ""}`}>{act.label || ev.activity_type}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {ev.time && <span className="text-xs text-muted-foreground font-medium">{ev.time}</span>}
                      {ev.collaborator_name && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="w-3.5 h-3.5" /> {ev.collaborator_name}
                        </span>
                      )}
                      {ev.client_name && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5" /> {ev.client_name}
                        </span>
                      )}
                    </div>
                    {ev.notes && <p className="text-xs text-muted-foreground mt-0.5 italic truncate">"{ev.notes}"</p>}
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    {StatusIcon && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.color || ""}`}>
                        <StatusIcon className="w-3.5 h-3.5" /> {st.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}