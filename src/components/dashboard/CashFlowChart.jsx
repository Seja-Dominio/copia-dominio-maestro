import { useMemo, useState, useEffect } from "react";
import { format, addDays, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBRL(val) {
  if (!val) return "R$ 0";
  if (Math.abs(val) >= 1000) return "R$ " + (val / 1000).toFixed(1) + "k";
  return "R$ " + val.toFixed(0);
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl shadow-xl p-3 text-xs">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p, i) =>
        p.value !== 0 ? (
          <div key={i} className="flex items-center gap-2 mb-0.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-semibold text-foreground">{formatBRL(Math.abs(p.value))}</span>
          </div>
        ) : null
      )}
    </div>
  );
}

export default function CashFlowChart({ entries, period }) {
  const [RC, setRC] = useState(null);
  useEffect(() => {
    import("recharts").then(setRC);
  }, []);

  const today = new Date();

  const data = useMemo(() => {
    const days = [];
    const windowStart = period && period.start ? parseISO(period.start) : subDays(today, 7);
    const windowEnd = period && period.end ? parseISO(period.end) : addDays(today, 30);
    const totalDays = Math.ceil((windowEnd - windowStart) / (1000 * 60 * 60 * 24)) + 1;

    for (let i = 0; i < totalDays; i++) {
      const day = addDays(windowStart, i);
      const dateStr = format(day, "yyyy-MM-dd");
      const isPast = day <= today;
      const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
      const lbl = format(day, "dd/MM", { locale: ptBR });

      const dayEntries = entries.filter(function(e) {
        var date = e.due_date || e.competence_date;
        return date === dateStr;
      });

      var realRev = 0, realExp = 0, foreRev = 0, foreExp = 0;
      dayEntries.forEach(function(e) {
        var amt = e.amount || 0;
        if (e.type === "revenue" && e.status === "paid") realRev += amt;
        if (e.type === "expense" && e.status === "paid") realExp += amt;
        if (e.type === "revenue" && (e.status === "pending" || e.status === "forecast")) foreRev += amt;
        if (e.type === "expense" && (e.status === "pending" || e.status === "forecast")) foreExp += amt;
      });

      days.push({
        label: lbl,
        dateStr: dateStr,
        isToday: isToday,
        "Receita Realizada": (isPast || isToday) ? realRev : 0,
        "Despesa Realizada": (isPast || isToday) ? -realExp : 0,
        "Receita Prevista": !isPast ? foreRev : 0,
        "Despesa Prevista": !isPast ? -foreExp : 0,
        "Saldo": (isPast || isToday) ? (realRev - realExp) : (foreRev - foreExp),
      });
    }
    return days;
  }, [entries, period]);

  var weekBalance = 0;
  data.forEach(function(d) {
    weekBalance += (d["Receita Realizada"] || 0) + (d["Despesa Realizada"] || 0);
  });
  var isPositive = weekBalance >= 0;
  var todayIndex = data.findIndex(function(d) { return d.isToday; });

  if (!RC) {
    return (
      <div className="space-y-4">
        <div className={"rounded-xl p-4 border " + (isPositive ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800")}>
          <p className={"text-xs font-semibold uppercase tracking-wide " + (isPositive ? "text-emerald-600" : "text-red-600")}>
            {"Saldo Realizado " + (period ? "(" + period.start + " → " + period.end + ")" : "(ultimos 7 dias)")}
          </p>
          <p className={"text-3xl font-black mt-1 " + (isPositive ? "text-emerald-600" : "text-red-600")}>
            {formatBRL(weekBalance)}
          </p>
        </div>
        <div className="h-[220px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  var { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } = RC;

  return (
    <div className="space-y-4">
      <div className={"rounded-xl p-4 border " + (isPositive ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800")}>
        <p className={"text-xs font-semibold uppercase tracking-wide " + (isPositive ? "text-emerald-600" : "text-red-600")}>
          {"Saldo Realizado " + (period ? "(" + period.start + " → " + period.end + ")" : "(ultimos 7 dias)")}
        </p>
        <p className={"text-3xl font-black mt-1 " + (isPositive ? "text-emerald-600" : "text-red-600")}>
          {formatBRL(weekBalance)}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={3} />
          <YAxis tickFormatter={formatBRL} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} width={52} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          {todayIndex >= 0 && (
            <ReferenceLine x={data[todayIndex].label} stroke="hsl(var(--primary))" strokeDasharray="4 2" label={{ value: "Hoje", position: "top", fontSize: 9, fill: "hsl(var(--primary))" }} />
          )}
          <Bar dataKey="Receita Realizada" fill="#10b981" radius={[3, 3, 0, 0]} barSize={8} />
          <Bar dataKey="Despesa Realizada" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={8} />
          <Bar dataKey="Receita Prevista" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={6} opacity={0.5} />
          <Bar dataKey="Despesa Prevista" fill="#f87171" radius={[3, 3, 0, 0]} barSize={6} opacity={0.5} />
          <Line dataKey="Saldo" stroke="#f59e0b" strokeWidth={2} dot={false} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}