import { useState, useMemo, useRef, useEffect } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, X, Calendar, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStatusConfig } from "@/lib/AppConfigContext";

const CONTENT_LABELS = {
  feed_card: "Card", reels: "Reels", story: "Story", video: "Vídeo",
  trafego_pago: "Tráfego", card_trafego: "Card Tráfego", video_trafego: "Vídeo Tráfego",
  email: "Email", blog: "Blog", outros: "Outros",
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function AllJobsCalendar({ jobs, onClose, onJobClick }) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [popoverPos, setPopoverPos] = useState(null);
  const popoverRef = useRef(null);
  const calendarRef = useRef(null);
  const { statusConfig } = useStatusConfig();

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);

  const jobsByDate = useMemo(() => {
    const map = {};
    jobs.forEach(j => {
      if (!j.post_date) return;
      const key = j.post_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(j);
    });
    return map;
  }, [jobs]);

  const totalJobsMonth = useMemo(() => {
    let count = 0;
    days.forEach(d => {
      const key = format(d, "yyyy-MM-dd");
      count += (jobsByDate[key] || []).length;
    });
    return count;
  }, [days, jobsByDate]);

  // Close popover on outside click
  useEffect(() => {
    if (!selectedDay) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setSelectedDay(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedDay]);

  const handleDayClick = (day, key, e) => {
    const dayJobs = jobsByDate[key] || [];
    if (dayJobs.length === 0) return;

    const cellRect = e.currentTarget.getBoundingClientRect();
    const calRect = calendarRef.current?.getBoundingClientRect();
    if (!calRect) return;

    // Position popover 20px below the clicked cell, relative to the calendar container
    const top = cellRect.bottom - calRect.top + 20;
    let left = cellRect.left - calRect.left;

    // Clamp so popover doesn't overflow right edge
    const popoverWidth = 640;
    if (left + popoverWidth > calRect.width) {
      left = calRect.width - popoverWidth - 8;
    }
    if (left < 8) left = 8;

    setPopoverPos({ top, left });
    setSelectedDay(key);
  };

  const selectedJobs = selectedDay ? (jobsByDate[selectedDay] || []) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex flex-col overflow-auto" style={{ paddingTop: "calc(3.5rem + 20px)" }} onClick={onClose}>
      <div
        ref={calendarRef}
        className="bg-card rounded-xl shadow-2xl border border-border w-[calc(100%-40px)] max-w-5xl animate-fade-in relative mx-auto mb-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-bold text-lg text-foreground">Calendário de Postagens</h2>
              <p className="text-xs text-muted-foreground">{totalJobsMonth} jobs no mês</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => { setCurrentMonth(m => subMonths(m, 1)); setSelectedDay(null); }}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <span className="font-semibold text-foreground capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="ghost" size="icon" onClick={() => { setCurrentMonth(m => addMonths(m, 1)); setSelectedDay(null); }}>
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 px-4">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 px-4 pb-4 gap-px">
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[80px] md:min-h-[100px]" />
          ))}

          {days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayJobs = jobsByDate[key] || [];
            const today = isToday(day);
            const isSelected = selectedDay === key;

            return (
              <div
                key={key}
                onClick={(e) => handleDayClick(day, key, e)}
                className={`min-h-[80px] md:min-h-[100px] border rounded-lg p-1 cursor-pointer transition-all ${
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : today
                      ? "bg-primary/5 border-primary/30"
                      : "border-border/50 bg-background hover:bg-muted/50"
                }`}
              >
                <div className={`text-xs font-semibold mb-1 px-1 ${
                  today ? "text-primary" : "text-muted-foreground"
                }`}>
                  {format(day, "d")}
                  {dayJobs.length > 0 && (
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">({dayJobs.length})</span>
                  )}
                </div>
                <div className="space-y-0.5 overflow-hidden max-h-[60px] md:max-h-[80px]">
                  {dayJobs.slice(0, 3).map(job => {
                    const st = statusConfig[job.status];
                    const isCompleted = job.status === "completed";
                    return (
                      <div
                        key={job.id}
                        className={`w-full text-left px-1 py-0.5 rounded text-[10px] leading-tight truncate no-touch-min relative ${
                          isCompleted ? "bg-green-100 dark:bg-green-900/30" : ""
                        }`}
                        style={{ minHeight: "unset", minWidth: "unset" }}
                        title={`${job.title} — ${job.client_name || ""}`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${st?.dot || "bg-gray-400"}`} />
                        <span className={`font-medium ${isCompleted ? "text-green-800 dark:text-green-300" : "text-foreground"}`}>
                          {job.client_name?.split(" ")[0] || ""}
                        </span>
                        <span className={isCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                          {" "}{CONTENT_LABELS[job.content_type] || ""}
                        </span>
                      </div>
                    );
                  })}
                  {dayJobs.length > 3 && (
                    <span className="text-[10px] text-muted-foreground px-1 no-touch-min" style={{ minHeight: "unset" }}>
                      +{dayJobs.length - 3} mais
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Day detail popover */}
        {selectedDay && popoverPos && (
          <div
            ref={popoverRef}
            className="absolute z-60 w-[640px] bg-card border border-border rounded-xl shadow-2xl animate-fade-in"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm text-foreground">
                {format(new Date(selectedDay + "T12:00:00"), "dd 'de' MMMM", { locale: ptBR })}
              </h3>
              <span className="text-xs text-muted-foreground">{selectedJobs.length} jobs</span>
            </div>
            <div className="max-h-[512px] overflow-auto p-2 space-y-1">
              {selectedJobs.map(job => {
                const st = statusConfig[job.status];
                const isCompleted = job.status === "completed";
                return (
                  <button
                    key={job.id}
                    onClick={() => onJobClick?.(job)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-muted/80 transition-colors flex items-center gap-2 group relative ${
                      isCompleted ? "bg-green-50 dark:bg-green-900/20" : ""
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st?.dot || "bg-gray-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${isCompleted ? "text-green-800 dark:text-green-300" : "text-foreground"}`}>
                        {job.client_name || "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {CONTENT_LABELS[job.content_type] || ""} — {job.title}
                      </p>
                      <span className={`text-[10px] font-medium ${st?.color || "text-muted-foreground"} inline-block px-1.5 py-0.5 rounded mt-0.5`}>
                        {st?.label || job.status}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}