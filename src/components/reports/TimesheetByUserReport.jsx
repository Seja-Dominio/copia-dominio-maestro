import { useMemo } from "react";
import { Clock, DollarSign, Briefcase, RotateCcw } from "lucide-react";

function fmtH(mins) {
  const h = Math.floor((mins || 0) / 60);
  const m = (mins || 0) % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}
function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function TimesheetByUserReport({ timesheets, collaborators, selectedUserId }) {
  const data = useMemo(() => {
    const userMap = {};
    timesheets.forEach(t => {
      const key = t.collaborator_id || "anon";
      if (!userMap[key]) {
        const collab = collaborators.find(c => c.id === t.collaborator_id);
        userMap[key] = {
          id: key,
          name: t.collaborator_name || "—",
          role: collab?.role || "",
          hourlyRate: collab?.hourly_rate || 0,
          totalMins: 0,
          reworkMins: 0,
          byClient: {},
        };
      }
      const u = userMap[key];
      const mins = t.duration_minutes || 0;
      u.totalMins += mins;
      if (t.is_rework) u.reworkMins += mins;

      const clientKey = t.client_id || "sem_cliente";
      if (!u.byClient[clientKey]) {
        u.byClient[clientKey] = { name: t.client_name || "Sem cliente", mins: 0, cost: 0 };
      }
      u.byClient[clientKey].mins += mins;
      u.byClient[clientKey].cost += (mins / 60) * u.hourlyRate;
    });

    let result = Object.values(userMap)
      .map(u => ({ ...u, totalCost: (u.totalMins / 60) * u.hourlyRate }))
      .sort((a, b) => b.totalCost - a.totalCost);
    
    if (selectedUserId) {
      result = result.filter(u => u.id === selectedUserId);
    }
    
    return result;
  }, [timesheets, collaborators, selectedUserId]);

  if (data.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhum apontamento no período</div>;
  }

  return (
    <div className="space-y-4">
      {data.map(user => {
        const clientList = Object.values(user.byClient).sort((a, b) => b.mins - a.mins);
        return (
          <div key={user.id} className="glass-card overflow-hidden">
            <div className="flex flex-wrap items-center gap-4 px-5 py-3.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                  {user.name[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">{user.name}</p>
                  {user.role && <p className="text-[10px] text-muted-foreground">{user.role}</p>}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-bold text-foreground">{fmtH(user.totalMins)}</span>
                </div>
                {user.reworkMins > 0 && (
                  <div className="flex items-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg px-2.5 py-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-orange-500" />
                    <span className="font-bold text-orange-600">{fmtH(user.reworkMins)}</span>
                    <span className="text-orange-500">retrabalho</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs bg-background border border-border rounded-lg px-2.5 py-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-green-500" />
                  <span className="font-bold text-green-600">{fmtR(user.totalCost)}</span>
                </div>
                {user.hourlyRate > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    {fmtR(user.hourlyRate)}/h
                  </div>
                )}
              </div>
            </div>

            <div className="p-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" /> Por Cliente
              </p>
              <div className="space-y-1.5">
                {clientList.map(cl => {
                  const maxMins = clientList[0]?.mins || 1;
                  const pct = Math.round((cl.mins / maxMins) * 100);
                  return (
                    <div key={cl.name} className="flex items-center gap-3">
                      <span className="text-xs text-foreground font-medium w-36 truncate flex-shrink-0">{cl.name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-foreground w-16 text-right flex-shrink-0">{fmtH(cl.mins)}</span>
                      <span className="text-xs text-green-600 font-semibold w-24 text-right flex-shrink-0">{fmtR(cl.cost)}</span>
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