import { useState, useEffect, useRef } from "react";
import { Bell, X, Briefcase, CheckSquare, Clock, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";

const TYPE_CONFIG = {
  subtask_unlocked: { icon: CheckSquare, color: "text-blue-500", bg: "bg-blue-50" },
  deadline_approaching: { icon: Clock, color: "text-amber-500", bg: "bg-amber-50" },
  job_overdue: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
  approval_pending: { icon: Briefcase, color: "text-purple-500", bg: "bg-purple-50" },
  master_request: { icon: AlertCircle, color: "text-orange-500", bg: "bg-orange-50" },
  request_approved: { icon: CheckSquare, color: "text-emerald-500", bg: "bg-emerald-50" },
  request_rejected: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
  mention: { icon: Bell, color: "text-primary", bg: "bg-primary/10" },
  daily_summary: { icon: Bell, color: "text-emerald-500", bg: "bg-emerald-50" },
};

export default function NotificationBell({ collaboratorId }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const panelRef = useRef(null);
  const PAGE_SIZE = 5;

  const loadedRef = useRef(false);
  const lastLoadTime = useRef(0);

  useEffect(() => {
    if (!collaboratorId) return;
    // Only load once per 30s to avoid rate limits
    const now = Date.now();
    if (!loadedRef.current || now - lastLoadTime.current > 30000) {
      loadedRef.current = true;
      lastLoadTime.current = now;
      loadNotifications(0);
    }

    const unsub = base44.entities.Notification.subscribe(event => {
      if (event.type === "create" && event.data?.user_id === collaboratorId) {
        setNotifications(prev => [event.data, ...prev]);
        setTotal(t => t + 1);
      } else if (event.type === "update") {
        setNotifications(prev => prev.map(n => n.id === event.id ? event.data : n));
      }
    });
    return unsub;
  }, [collaboratorId]);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function loadNotifications(p) {
    if (!collaboratorId) return;
    const all = await base44.entities.Notification.filter(
      { user_id: collaboratorId },
      "-created_date",
      30
    );
    setTotal(all.length);
    setNotifications(all);
    setPage(p);
  }

  const unread = notifications.filter(n => !n.is_read).length;
  const visible = notifications.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.ceil(notifications.length / PAGE_SIZE);

  async function markAllRead() {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    // Update sequentially in batches of 3 to avoid rate limits
    for (let i = 0; i < unreadIds.length; i += 3) {
      const batch = unreadIds.slice(i, i + 3);
      await Promise.all(batch.map(id => base44.entities.Notification.update(id, { is_read: true })));
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  async function markRead(n) {
    if (!n.is_read) {
      await base44.entities.Notification.update(n.id, { is_read: true });
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.entity_id && n.entity_type === "job") {
      window.location.href = `${createPageUrl("Jobs")}?job=${n.entity_id}`;
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground relative"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-card border border-border rounded-2xl shadow-2xl z-[200] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">Notificações</span>
              {unread > 0 && (
                <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{unread}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-primary font-semibold hover:underline">
                  Marcar lidas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted">
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border">
            {visible.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Sem notificações
              </div>
            ) : (
              visible.map(n => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.daily_summary;
                const Icon = cfg.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => markRead(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-primary/5" : ""}`}
                  >
                    <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-tight ${!n.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                        {n.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                      <p className="text-[9px] text-muted-foreground/60 mt-1">
                        {n.created_date ? format(parseISO(n.created_date), "dd/MM HH:mm", { locale: ptBR }) : ""}
                      </p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1" />}
                  </button>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="text-[10px] text-muted-foreground font-semibold hover:text-foreground disabled:opacity-30"
              >← Ant</button>
              <span className="text-[10px] text-muted-foreground">{page + 1}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="text-[10px] text-muted-foreground font-semibold hover:text-foreground disabled:opacity-30"
              >Próx →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}