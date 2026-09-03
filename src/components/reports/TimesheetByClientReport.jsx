import { useMemo } from "react";
import { Users, Clock, DollarSign, RotateCcw } from "lucide-react";

function fmtH(mins) {
  const h = Math.floor((mins || 0) / 60);
  const m = (mins || 0) % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}
function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function TimesheetByClientReport({ timesheets, collaborators }) {
  const data = useMemo(() => {
    const clientMap = {};
    timesheets.forEach(t => {
      if (!t.client_id) return;
      if (!clientMap[t.client_id]) {
        clientMap[t.client_id] = {
          id: t.client_id,
          name: t.client_name || "—",
          totalMins: 0,
          reworkMins: 0,
          totalCost: 0,
          byCollab: {},
        };
      }
      const c = clientMap[t.client_id];
      const mins = t.duration_minutes || 0;
      c.totalMins += mins;
      if (t.is_rework) c.reworkMins += mins;

      const collab = collaborators.find(col => col.id === t.collaborator_id);
      const rate = collab?.hourly_rate || 0;
      const cost = (mins / 60) * rate;
      c.totalCost += cost;

      if (!c.byCollab[t.collaborator_id || "anon"]) {
        c.byCollab[t.collaborator_id || "anon"] = {
          name: t.collaborator_name || "—",
          mins: 0, cost: 0,
        };
      }
      c.byCollab[t.collaborator_id || "anon"].mins += mins;
      c.byCollab[t.collaborator_id || "anon"].cost += cost;
    });

    return Object.values(clientMap).sort((a, b) => b.totalMins - a.totalMins);
  }, [timesheets, collaborators]);

  if (data.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhum apontamento no período</div>;
  }

  return (
    <div className="space-y-4">
      {data.map(client => {
        const collabList = Object.values(client.byCollab).sort((a, b) => b.mins - a.mins);
        return (
          <div key={client.id} className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 px-5 py-3.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {client.name[0]?.toUpperCase()}
                </div>
                <span className="font-bold text-foreground text-sm">{client.name}</span>
              </div>
              <div className="ml-auto flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-bold text-foreground">{fmtH(client.totalMins)}</span>
                  <span className="text-muted-foreground">total</span>
                </div>
                {client.reworkMins > 0 && (
                  <div className="flex items-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg px-2.5 py-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-orange-500" />
                    <span className="font-bold text-orange-600">{fmtH(client.reworkMins)}</span>
                    <span className="text-orange-500">retrabalho</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-green-500" />
                  <span className="font-bold text-green-600">{fmtR(client.totalCost)}</span>
                </div>
              </div>
            </div>
            <div className="p-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Por Colaborador
              </p>
              <div className="space-y-1.5">
                {collabList.map(col => {
                  const maxMins = collabList[0]?.mins || 1;
                  const pct = Math.round((col.mins / maxMins) * 100);
                  return (
                    <div key={col.name} className="flex items-center gap-3">
                      <span className="text-xs text-foreground font-medium w-32 truncate flex-shrink-0">{col.name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-foreground w-16 text-right flex-shrink-0">{fmtH(col.mins)}</span>
                      <span className="text-xs text-green-600 font-semibold w-24 text-right flex-shrink-0">{fmtR(col.cost)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}