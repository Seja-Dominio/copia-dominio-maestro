import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, parseISO, startOfWeek, addWeeks, subWeeks, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Calendar, User, Filter, CheckCircle2, XCircle, Clock, Briefcase, ChevronDown, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileSelect } from "@/components/ui/bottom-sheet";
import AgendaEventDrawer from "@/components/agenda/AgendaEventDrawer";
import MonthCalendar from "@/components/agenda/MonthCalendar";
import WeekCalendar from "@/components/agenda/WeekCalendar";
import DayEventsModal from "@/components/agenda/DayEventsModal";
import ClientKeyActivities from "@/components/agenda/ClientKeyActivities";


export const DEFAULT_ACTIVITY_CONFIG = {
  captacao: { label: "Captação", color: "bg-violet-100 text-violet-700 border-violet-200", dot: "bg-violet-500", hex: "#7c3aed" },
  reuniao_relatorio: { label: "Reunião de Relatório", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500", hex: "#3b82f6" },
  feedback_semanal: { label: "Feedback Semanal", color: "bg-cyan-100 text-cyan-700 border-cyan-200", dot: "bg-cyan-500", hex: "#06b6d4" },
  reuniao_cronograma: { label: "Reunião de Cronograma", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500", hex: "#22c55e" },
  reuniao_comercial: { label: "Reunião Comercial", color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500", hex: "#8b5cf6" },
  apresentacao_proposta: { label: "Apresentação de Proposta", color: "bg-indigo-100 text-indigo-700 border-indigo-200", dot: "bg-indigo-500", hex: "#6366f1" },
  alinhamento_cliente: { label: "Alinhamento c/ Cliente", color: "bg-teal-100 text-teal-700 border-teal-200", dot: "bg-teal-500", hex: "#14b8a6" },
  visita_cliente: { label: "Visita ao Cliente", color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", hex: "#10b981" },
  ligacao: { label: "Ligação", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500", hex: "#f59e0b" },
  followup: { label: "Follow-up", color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500", hex: "#f97316" },
  reuniao_interna: { label: "Reunião Interna", color: "bg-pink-100 text-pink-700 border-pink-200", dot: "bg-pink-500", hex: "#ec4899" },
  captacao_imagens: { label: "Captação de Imagens", color: "bg-rose-100 text-rose-700 border-rose-200", dot: "bg-rose-500", hex: "#f43f5e" },
  reuniao_planejamento: { label: "Reunião de Planejamento", color: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500", hex: "#0ea5e9" },
  edicao_video: { label: "Edição de Vídeo", color: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200", dot: "bg-fuchsia-500", hex: "#d946ef" },
  producao_conteudo: { label: "Produção de Conteúdo", color: "bg-lime-100 text-lime-700 border-lime-200", dot: "bg-lime-500", hex: "#84cc16" },
  entrega_material: { label: "Entrega de Material", color: "bg-yellow-100 text-yellow-700 border-yellow-200", dot: "bg-yellow-500", hex: "#eab308" },
  outro: { label: "Outro", color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400", hex: "#9ca3af" }
};

// Build dynamic activity config from localStorage
export function getActivityConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem("agendaActivityConfig") || "null");
    if (stored && Array.isArray(stored)) {
      const map = {};
      stored.forEach(a => { map[a.key] = { label: a.label, color: a.color, dot: a.dot, hex: a.hex, default_duration: a.default_duration }; });
      return map;
    }
  } catch {}
  return DEFAULT_ACTIVITY_CONFIG;
}

export const ACTIVITY_CONFIG = DEFAULT_ACTIVITY_CONFIG;

const STATUS_CONFIG = {
  agendado: { label: "Agendado", color: "bg-blue-100 text-blue-700", icon: Clock },
  realizado: { label: "Realizado", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  noshow: { label: "No-show", color: "bg-red-100 text-red-700", icon: XCircle },
  cancelado: { label: "Cancelado", color: "bg-gray-100 text-gray-500", icon: XCircle }
};

export { STATUS_CONFIG };

export default function Agenda() {
  const [activityConfig, setActivityConfig] = useState(() => getActivityConfig());
  const [events, setEvents] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [defaultDate, setDefaultDate] = useState(null);
  const [viewMode, setViewMode] = useState("week"); // "week" | "month"
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "yyyy-MM"));
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [filterCollab, setFilterCollab] = useState("all");
  const [filterActivity, setFilterActivity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dayModalDate, setDayModalDate] = useState(null);

  // Refresh activity config when localStorage changes (from settings)
  useEffect(() => {
    const onStorage = (e) => { if (e.key === "agendaActivityConfig") setActivityConfig(getActivityConfig()); };
    window.addEventListener("storage", onStorage);
    // Also poll for same-tab changes
    const interval = setInterval(() => setActivityConfig(getActivityConfig()), 1000);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(interval); };
  }, []);

  useEffect(() => {loadAll();}, []);

  async function loadAll() {
    setLoading(true);
    const [ev, col, cl] = await Promise.all([
    base44.entities.AgendaEvent.list("-date", 300),
    base44.entities.Collaborator.list("name", 50),
    base44.entities.Client.filter({ status: "active" }, "name", 100)]
    );
    setEvents(ev);
    setCollaborators(col);
    setClients(cl);
    setLoading(false);
  }

  const filteredEvents = events.filter((ev) => {
    let dateMatch = true;
    if (viewMode === "month") {
      dateMatch = !filterMonth || ev.date?.startsWith(filterMonth);
    } else {
      const weekEnd = format(addWeeks(weekStart, 1), "yyyy-MM-dd");
      const ws = format(weekStart, "yyyy-MM-dd");
      dateMatch = ev.date >= ws && ev.date < weekEnd;
    }
    const collabMatch = filterCollab === "all" || ev.collaborator_id === filterCollab;
    const actMatch = filterActivity === "all" || ev.activity_type === filterActivity;
    const statusMatch = filterStatus === "all" || ev.status === filterStatus;
    return dateMatch && collabMatch && actMatch && statusMatch;
  });

  const monthEvents = events.filter((ev) => ev.date?.startsWith(filterMonth));

  function navigatePrev() {
    if (viewMode === "week") {
      setWeekStart(prev => subWeeks(prev, 1));
    } else {
      const [y, m] = filterMonth.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      setFilterMonth(format(subMonths(d, 1), "yyyy-MM"));
    }
  }

  function navigateNext() {
    if (viewMode === "week") {
      setWeekStart(prev => addWeeks(prev, 1));
    } else {
      const [y, m] = filterMonth.split("-").map(Number);
      const d = new Date(y, m - 1, 1);
      setFilterMonth(format(addMonths(d, 1), "yyyy-MM"));
    }
  }

  function navigateToday() {
    if (viewMode === "week") {
      setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
    } else {
      setFilterMonth(format(new Date(), "yyyy-MM"));
    }
  }

  const periodLabel = viewMode === "month"
    ? format(new Date(filterMonth + "-01"), "MMMM yyyy", { locale: ptBR })
    : `${format(weekStart, "dd/MM")} — ${format(addWeeks(weekStart, 1), "dd/MM/yyyy")}`;
  const stats = {
    agendado: monthEvents.filter((e) => e.status === "agendado").length,
    realizado: monthEvents.filter((e) => e.status === "realizado").length,
    noshow: monthEvents.filter((e) => e.status === "noshow").length,
    cancelado: monthEvents.filter((e) => e.status === "cancelado").length
  };

  // monthOptions removed — navigation handled by prev/next buttons

  const grouped = {};
  filteredEvents.forEach((ev) => {
    if (!grouped[ev.date]) grouped[ev.date] = [];
    grouped[ev.date].push(ev);
  });
  const sortedDates = Object.keys(grouped).sort();

  async function handleStatusChange(ev, newStatus) {
    await base44.entities.AgendaEvent.update(ev.id, { status: newStatus });
    setEvents((prev) => prev.map((e) => e.id === ev.id ? { ...e, status: newStatus } : e));
  }

  function openNewEvent(date) {
    setEditingEvent(null);
    setDefaultDate(date || null);
    setShowDrawer(true);
  }

  const dayEvents = dayModalDate ? events.filter((e) => e.date === dayModalDate) : [];

  return (
    <div className="p-4 max-w-[1400px] mx-auto space-y-4">

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-foreground">Agenda Empresarial</h1>
        </div>

        {/* Navigation + View Toggle */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={navigatePrev} className="w-8 h-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={navigateToday} className="px-3 h-8 rounded-lg border border-border hover:bg-muted text-xs font-semibold transition-colors">
              Hoje
            </button>
            <button onClick={navigateNext} className="w-8 h-8 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-foreground capitalize ml-1">{periodLabel}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* View mode toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("week")}
                className={`px-3 h-8 text-xs font-semibold transition-colors flex items-center gap-1.5 ${viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                <CalendarDays className="w-3.5 h-3.5" /> Semanal
              </button>
              <button
                onClick={() => setViewMode("month")}
                className={`px-3 h-8 text-xs font-semibold transition-colors flex items-center gap-1.5 ${viewMode === "month" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                <Calendar className="w-3.5 h-3.5" /> Mensal
              </button>
            </div>

            <Button size="sm" className="gap-1.5 h-8 text-xs ml-1" onClick={() => openNewEvent(null)}>
              <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Novo Evento</span>
            </Button>
          </div>
        </div>


      </div>

      {/* Filters inline — compacto */}
      <div className="flex gap-2 items-center overflow-x-auto pb-0.5">
        <Filter className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <MobileSelect value={filterCollab} onChange={setFilterCollab}
          options={[{ value: "all", label: "Todos profissionais" }, ...collaborators.map((c) => ({ value: c.id, label: c.name }))]}
          placeholder="Profissional" className="h-7 text-xs min-w-[130px]" />
        <MobileSelect value={filterActivity} onChange={setFilterActivity}
          options={[{ value: "all", label: "Todas atividades" }, ...Object.entries(activityConfig).map(([k, v]) => ({ value: k, label: v.label }))]}
          placeholder="Atividade" className="h-7 text-xs min-w-[130px]" />
        <MobileSelect value={filterStatus} onChange={setFilterStatus}
          options={[{ value: "all", label: "Todos status" }, ...Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))]}
          placeholder="Status" className="h-7 text-xs min-w-[110px]" />
        <span className="ml-auto text-xs text-muted-foreground font-semibold whitespace-nowrap">
          {filteredEvents.length} evento{filteredEvents.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Calendar — semanal ou mensal */}
      {viewMode === "month" ? (
        <MonthCalendar
          month={filterMonth}
          events={events}
          activityConfig={activityConfig}
          onDayClick={setDayModalDate}
          onAddEvent={openNewEvent} />
      ) : (
        <WeekCalendar
          weekStart={weekStart}
          events={events}
          activityConfig={activityConfig}
          collaborators={collaborators}
          onDayClick={setDayModalDate}
          onAddEvent={openNewEvent}
          onEventClick={(ev) => { setEditingEvent(ev); setDefaultDate(null); setShowDrawer(true); }} />
      )}

      {/* Atividades-chave por cliente */}
      <ClientKeyActivities monthEvents={monthEvents} clients={clients} />

      <div className="space-y-4">

        {/* Events list */}
        <div className="space-y-4">
          {sortedDates.length > 0 &&
          sortedDates.map((date) => {
            const dayEvts = grouped[date].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
            const d = parseISO(date);
            const isToday = date === format(new Date(), "yyyy-MM-dd");
            return (
              <div key={date} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                  <div className={`px-5 py-3 border-b border-border flex items-center gap-3 ${isToday ? "bg-primary/5" : "bg-muted/30"}`}>
                    <div className={`w-9 h-9 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${isToday ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                      <span className="text-xs font-black leading-none">{format(d, "dd")}</span>
                      <span className="text-[10px] uppercase">{format(d, "MMM", { locale: ptBR })}</span>
                    </div>
                    <div>
                      <p className={`text-sm font-bold capitalize ${isToday ? "text-primary" : "text-foreground"}`}>
                        {isToday ? "Hoje" : format(d, "EEEE", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">{dayEvts.length} evento{dayEvts.length !== 1 ? "s" : ""}</p>
                    </div>

                  </div>
                  <div className="divide-y divide-border overflow-y-auto" style={{ maxHeight: 5 * 64 }}>
                    {dayEvts.map((ev) => {
                    const act = activityConfig[ev.activity_type] || activityConfig.outro || DEFAULT_ACTIVITY_CONFIG.outro;
                    const st = STATUS_CONFIG[ev.status] || STATUS_CONFIG.agendado;
                    const StatusIcon = st.icon;
                    const collab = ev.collaborator_id ? collaborators.find(c => c.id === ev.collaborator_id) : null;
                    const dotColor = collab?.color || act.hex;
                    return (
                      <div key={ev.id} className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors group">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-foreground">{ev.title}</p>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${act.color}`}>{act.label}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {ev.time && <span className="text-xs text-muted-foreground font-medium">{ev.time}{ev.end_time ? ` – ${ev.end_time}` : ""}</span>}
                              {ev.collaborator_name &&
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <User className="w-3.5 h-3.5" /> {ev.collaborator_name}
                                </span>
                            }
                              {ev.client_name &&
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Briefcase className="w-3.5 h-3.5" /> {ev.client_name}
                                </span>
                            }
                            </div>
                            {ev.notes && <p className="text-xs text-muted-foreground mt-0.5 italic truncate">"{ev.notes}"</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.color}`}>
                              <StatusIcon className="w-3.5 h-3.5" /> {st.label}
                            </span>
                            <MobileSelect
                            value={ev.status}
                            onChange={(val) => handleStatusChange(ev, val)}
                            options={Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
                            placeholder="Status"
                            className="opacity-0 group-hover:opacity-100 h-6 text-xs w-24 transition-opacity" />
                          
                            <button
                            onClick={() => {setEditingEvent(ev);setDefaultDate(null);setShowDrawer(true);}}
                            className="opacity-0 group-hover:opacity-100 transition-opacity w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
                            
                              <ChevronDown className="w-3.5 h-3.5 rotate-[-90deg]" />
                            </button>
                          </div>
                        </div>);

                  })}
                  </div>
                </div>);

          })
          }

        </div>
      </div>

      {/* Modal de eventos do dia */}
      {dayModalDate &&
      <DayEventsModal
        date={dayModalDate}
        events={dayEvents}
        activityConfig={activityConfig}
        statusConfig={STATUS_CONFIG}
        onClose={() => setDayModalDate(null)}
        onEdit={(ev) => {setDayModalDate(null);setEditingEvent(ev);setDefaultDate(null);setShowDrawer(true);}}
        onAdd={() => {setDayModalDate(null);openNewEvent(dayModalDate);}}
        onStatusChange={handleStatusChange} />

      }

      {showDrawer &&
      <AgendaEventDrawer
        event={editingEvent}
        defaultDate={defaultDate}
        collaborators={collaborators.filter(c => c.is_active !== false)}
        clients={clients}
        activityConfig={activityConfig}
        onClose={() => {setShowDrawer(false);setEditingEvent(null);setDefaultDate(null);}}
        onSaved={() => {loadAll();setShowDrawer(false);setEditingEvent(null);setDefaultDate(null);}} />

      }
    </div>);

}