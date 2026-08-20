import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { nowManaus } from "@/lib/dateUtils";
import { Timer, Play, Square } from "lucide-react";
import { createPageUrl } from "@/utils";

function elapsed(startedAt) {
  const diff = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, "0")}h:${String(m).padStart(2, "0")}m:${String(s).padStart(2, "0")}s`;
}

export default function TimesheetMonitor({ collaborators }) {
  const [runningTimesheets, setRunningTimesheets] = useState([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const ts = await base44.entities.Timesheet.filter({ is_running: true }, "-started_at", 50);
        setRunningTimesheets(ts);
      } catch (e) {
        console.warn("TimesheetMonitor: falha ao carregar", e);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // Tick every second to update elapsed time display
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // All active collaborators, merge with running timesheets
  const activeCollabs = collaborators.filter(c => c.is_active !== false);

  const withStatus = activeCollabs.map(c => {
    const ts = runningTimesheets.find(t => t.collaborator_id === c.id);
    return { ...c, timesheet: ts || null };
  });

  const activeCount = withStatus.filter(c => c.timesheet).length;
  const inactiveCount = withStatus.filter(c => !c.timesheet).length;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-rose-500 rounded-lg flex items-center justify-center">
            <Timer className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Timesheet em Tempo Real</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-green-600 font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            {activeCount} ativos
          </span>
          <span className="text-muted-foreground font-semibold">{inactiveCount} sem atividade</span>
        </div>
      </div>

      <div className="divide-y divide-border">
        {withStatus.map(c => (
          <div key={c.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/40 transition-colors ${c.timesheet ? "bg-green-50/40 dark:bg-green-900/10" : ""}`} onClick={() => { if (c.timesheet?.job_id) window.location.href = `${createPageUrl("Jobs")}?job=${c.timesheet.job_id}`; }}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {c.name[0]?.toUpperCase()}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 mr-1">
              {c.timesheet ? (
                <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_6px_2px_rgba(34,197,94,0.5)] animate-pulse inline-block" />
              ) : (
                <span className="w-3 h-3 rounded-full bg-muted-foreground/30 inline-block" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
              {c.timesheet ? (
                <p className="text-[10px] text-muted-foreground truncate">
                  {c.timesheet.job_title || "—"}
                  {c.timesheet.client_name ? <span className="text-muted-foreground/60"> · {c.timesheet.client_name}</span> : ""}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  {c.last_seen_page && c.last_seen_at && (Date.now() - new Date(c.last_seen_at).getTime()) < 2 * 60 * 60 * 1000
                    ? <span>Navegando em <span className="font-medium text-foreground/70">{c.last_seen_page}</span></span>
                    : "Sem timesheet aberto"}
                </p>
              )}
            </div>
            {c.timesheet ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-xs font-mono font-bold text-foreground tabular-nums">
                  {elapsed(c.timesheet.started_at)}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-muted-foreground flex-shrink-0">—</span>
            )}
          </div>
        ))}
        {withStatus.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">Nenhum colaborador cadastrado</div>
        )}
      </div>
    </div>
  );
}