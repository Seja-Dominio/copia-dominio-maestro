import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus } from "lucide-react";

export default function MonthCalendar({ month, events, activityConfig = {}, onDayClick, onAddEvent }) {
  // Parse month string safely (avoid timezone offset issues)
  const [year, mon] = month.split("-").map(Number);
  const currentMonth = new Date(year, mon - 1, 1);

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const firstDayOfWeek = getDay(start);

  const eventsByDate = {};
  events.forEach(ev => {
    if (ev.date?.startsWith(format(currentMonth, "yyyy-MM"))) {
      if (!eventsByDate[ev.date]) eventsByDate[ev.date] = [];
      eventsByDate[ev.date].push(ev);
    }
  });

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const emptyDays = Array(firstDayOfWeek).fill(null);
  const allDays = [...emptyDays, ...days];
  const todayStr = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <div className="flex gap-1" />
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(day => (
          <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {allDays.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} className="aspect-square" />;

          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate[dateStr] || [];
          const isToday = dateStr === todayStr;

          return (
            <div
              key={dateStr}
              className={`aspect-square p-1 rounded-lg border text-xs flex flex-col items-start justify-start gap-0.5 relative group transition-all cursor-pointer hover:bg-muted/50 ${
                isToday ? "bg-primary/10 border-primary" : "border-border hover:border-primary/30"
              }`}
              onClick={() => onDayClick?.(dateStr)}
            >
              <span className={`font-semibold leading-none ${isToday ? "text-primary" : "text-foreground"}`}>
                {format(day, "d")}
              </span>

              {/* Botão + ao hover */}
              <button
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center bg-primary/80 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={e => { e.stopPropagation(); onAddEvent?.(dateStr); }}
              >
                <Plus className="w-2.5 h-2.5" />
              </button>

              {dayEvents.length > 0 && (
                <div className="w-full space-y-0.5 overflow-hidden">
                  {dayEvents.slice(0, 2).map((ev, i) => {
                    const ac = activityConfig[ev.activity_type];
                    const bg = ac?.hex || "#6366f1";
                    return (
                      <div
                        key={i}
                        className="w-full text-[10px] px-0.5 py-px rounded truncate text-white font-medium"
                        style={{ backgroundColor: bg }}
                      >
                        {ev.title}
                      </div>
                    );
                  })}
                  {dayEvents.length > 2 && (
                    <div className="w-full text-[10px] px-0.5 text-muted-foreground">+{dayEvents.length - 2}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}