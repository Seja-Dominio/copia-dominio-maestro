import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus } from "lucide-react";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 — 20:00

export default function WeekCalendar({ weekStart, events, activityConfig = {}, collaborators = [], onDayClick, onAddEvent, onEventClick }) {
  // Index collaborator colors by id
  const collabColorMap = {};
  collaborators.forEach(c => { if (c.color) collabColorMap[c.id] = c.color; });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // Index events by date
  const eventsByDate = {};
  days.forEach(day => {
    const ds = format(day, "yyyy-MM-dd");
    eventsByDate[ds] = events.filter(ev => ev.date === ds);
  });

  // Parse "HH:MM" → hour number (float)
  const parseHour = (time) => {
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    return h + (m || 0) / 60;
  };

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Horizontal scroll wrapper for fixed-width columns */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 60 + 7 * 160 }}>
          {/* Header — day names + dates */}
          <div className="grid border-b border-border" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
            <div className="border-r border-border" />
            {days.map(day => {
              const ds = format(day, "yyyy-MM-dd");
              const isToday = ds === todayStr;
              return (
                <div
                  key={ds}
                  className={`text-center py-2.5 border-r border-border last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                  style={{ minWidth: 160 }}
                >
                  <p className={`text-[11px] uppercase font-bold tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {format(day, "EEE", { locale: ptBR })}
                  </p>
                  <div className={`inline-flex items-center justify-center w-9 h-9 rounded-full mt-0.5 ${isToday ? "bg-primary text-white" : "text-foreground"}`}>
                    <span className="text-lg font-black">{format(day, "d")}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
            <div className="grid" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
              {HOURS.map(hour => {
                const hourStr = String(hour).padStart(2, "0") + ":00";

                return (
                  <div key={hour} className="contents">
                    {/* Time label */}
                    <div className="border-r border-b border-border flex items-start justify-end pr-2 pt-1" style={{ minHeight: 64 }}>
                      <span className="text-[11px] text-muted-foreground font-medium">{hourStr}</span>
                    </div>

                    {/* Day cells */}
                    {days.map(day => {
                      const ds = format(day, "yyyy-MM-dd");
                      const isToday = ds === todayStr;
                      const dayEvts = eventsByDate[ds] || [];
                      const hourEvts = dayEvts.filter(ev => {
                        const h = parseHour(ev.time);
                        return h !== null && Math.floor(h) === hour;
                      });

                      return (
                        <div
                          key={ds + hour}
                          className={`border-r border-b border-border last:border-r-0 relative group cursor-pointer transition-colors hover:bg-muted/30 ${isToday ? "bg-primary/[0.02]" : ""}`}
                          style={{ minWidth: 160, minHeight: 64 }}
                          onClick={() => onDayClick?.(ds)}
                        >
                          {/* Add button on hover */}
                          <button
                            className="absolute top-0.5 right-0.5 w-5 h-5 rounded flex items-center justify-center bg-primary/80 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 no-touch-min"
                            onClick={e => { e.stopPropagation(); onAddEvent?.(ds); }}
                          >
                            <Plus className="w-3 h-3" />
                          </button>

                          {/* Events stacked vertically — text wraps freely */}
                          <div className="p-0.5 flex flex-col gap-0.5">
                            {hourEvts.map((ev, i) => {
                              const collabColor = ev.collaborator_id ? collabColorMap[ev.collaborator_id] : null;
                              const ac = activityConfig[ev.activity_type];
                              const bg = collabColor || ac?.hex || "#6366f1";
                              return (
                                <div
                                  key={ev.id || i}
                                  className="px-1.5 py-1 rounded text-white no-touch-min"
                                  style={{ backgroundColor: bg, fontSize: 11, lineHeight: "1.35" }}
                                  title={`${ev.title} — ${ev.time} — ${ev.client_name || ""} — ${ev.collaborator_name || ""}`}
                                  onClick={e => { e.stopPropagation(); onEventClick ? onEventClick(ev) : onDayClick?.(ds); }}
                                >
                                  <div className="font-bold break-words">{ev.client_name || "—"}</div>
                                  <div className="break-words opacity-90">{ev.title}</div>
                                  <div className="break-words opacity-75">{ev.collaborator_name || "—"}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}