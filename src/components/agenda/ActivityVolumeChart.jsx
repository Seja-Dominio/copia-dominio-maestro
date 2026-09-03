// Resumo de Reuniões — volume de atividades do mês por tipo
export default function ActivityVolumeChart({ monthEvents, activityConfig }) {
  const counts = {};
  monthEvents.forEach(ev => {
    counts[ev.activity_type] = (counts[ev.activity_type] || 0) + 1;
  });

  const total = monthEvents.length || 1;

  // Mostrar TODAS as atividades do config, mesmo com count 0
  const allTypes = Object.entries(activityConfig).map(([key, ac]) => ({
    key,
    label: ac.label,
    hex: ac.hex,
    count: counts[key] || 0,
  }));

  // Ordena do maior para o menor
  allTypes.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-foreground">Volume por Atividade</h3>
        <span className="ml-auto text-xs font-semibold text-muted-foreground">{monthEvents.length} total</span>
      </div>
      <div className="p-4 space-y-2">
        {allTypes.map(({ key, label, hex, count }) => {
          const pct = count > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={key} className={count === 0 ? "opacity-50" : ""}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: hex }} />
                  <span className="text-xs text-foreground font-medium truncate">{label}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {count > 0 && <span className="text-[10px] text-muted-foreground">{pct}%</span>}
                  <span className={`text-sm font-bold w-5 text-right ${count === 0 ? "text-muted-foreground" : "text-foreground"}`}>{count}</span>
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: hex }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}