import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Percent } from "lucide-react";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function ClientProfitabilityReport({ entries, timesheets, collaborators, period }) {
  const data = useMemo(() => {
    const filtered = period
      ? entries.filter(e => {
          const d = e.competence_date || e.due_date || e.payment_date;
          return d && d >= period.start && d <= period.end;
        })
      : entries;

    const filteredTs = period
      ? (timesheets || []).filter(t => {
          const d = t.started_at ? t.started_at.slice(0, 10) : null;
          return d && d >= period.start && d <= period.end;
        })
      : (timesheets || []);

    // Hourly rate map
    const rateMap = {};
    (collaborators || []).forEach(c => { rateMap[c.id] = c.hourly_rate || 0; });

    // Build client map
    const clientMap = {};
    filtered.filter(e => e.client_id).forEach(e => {
      if (!clientMap[e.client_id]) clientMap[e.client_id] = { id: e.client_id, name: e.client_name || "—", revenue: 0, expense: 0, hours: 0, hourCost: 0 };
      const c = clientMap[e.client_id];
      if (e.type === "revenue" && e.status === "paid") c.revenue += (e.amount || 0);
      if (e.type === "expense" && e.status === "paid") c.expense += (e.amount || 0);
    });

    filteredTs.forEach(t => {
      if (!t.client_id) return;
      if (!clientMap[t.client_id]) clientMap[t.client_id] = { id: t.client_id, name: t.client_name || "—", revenue: 0, expense: 0, hours: 0, hourCost: 0 };
      const c = clientMap[t.client_id];
      const hours = (t.duration_minutes || 0) / 60;
      c.hours += hours;
      c.hourCost += hours * (rateMap[t.collaborator_id] || 0);
    });

    const clientList = Object.values(clientMap).map(c => {
      const totalCost = c.expense + c.hourCost;
      const profit = c.revenue - totalCost;
      const margin = c.revenue > 0 ? ((profit / c.revenue) * 100).toFixed(1) : 0;
      return { ...c, totalCost, profit, margin: Number(margin) };
    }).sort((a, b) => b.profit - a.profit);

    const totals = clientList.reduce((acc, c) => ({
      revenue: acc.revenue + c.revenue,
      expense: acc.expense + c.expense,
      hourCost: acc.hourCost + c.hourCost,
      totalCost: acc.totalCost + c.totalCost,
      profit: acc.profit + c.profit,
      hours: acc.hours + c.hours,
    }), { revenue: 0, expense: 0, hourCost: 0, totalCost: 0, profit: 0, hours: 0 });

    totals.margin = totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(1) : 0;

    const chartData = clientList.slice(0, 15).map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + "…" : c.name,
      receita: c.revenue,
      custo: c.totalCost,
      lucro: c.profit,
    }));

    return { clientList, totals, chartData };
  }, [entries, timesheets, collaborators, period]);

  if (data.clientList.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhum dado de cliente no período</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Receita Total", value: fmtR(data.totals.revenue), icon: TrendingUp, color: "text-green-600", bg: "bg-green-100" },
          { label: "Custo Total", value: fmtR(data.totals.totalCost), icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
          { label: "Lucro", value: fmtR(data.totals.profit), icon: TrendingUp, color: data.totals.profit >= 0 ? "text-green-600" : "text-destructive", bg: "bg-blue-100" },
          { label: "Margem Média", value: `${data.totals.margin}%`, icon: Percent, color: Number(data.totals.margin) >= 30 ? "text-green-600" : "text-amber-600", bg: "bg-primary/10" },
        ].map(s => (
          <div key={s.label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 ${s.bg} rounded-lg flex items-center justify-center`}>
                <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              </div>
              <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {data.chartData.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">Receita x Custo por Cliente</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.chartData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={v => fmtR(v)} />
              <Legend />
              <Bar dataKey="receita" fill="#22c55e" radius={[0, 4, 4, 0]} name="Receita" />
              <Bar dataKey="custo" fill="#ef4444" radius={[0, 4, 4, 0]} name="Custo" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Receita</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Despesa Direta</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Custo Hora</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Horas</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Custo Total</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Lucro</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Margem</th>
              </tr>
            </thead>
            <tbody>
              {data.clientList.map((c, i) => (
                <tr key={c.id} className="border-b border-border">
                  <td className="px-4 py-2.5 text-muted-foreground font-bold">{i + 1}</td>
                  <td className="px-4 py-2.5 font-semibold text-foreground">{c.name}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-bold">{fmtR(c.revenue)}</td>
                  <td className="px-4 py-2.5 text-right text-destructive font-medium">{fmtR(c.expense)}</td>
                  <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmtR(c.hourCost)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{c.hours.toFixed(1)}h</td>
                  <td className="px-4 py-2.5 text-right text-destructive font-bold">{fmtR(c.totalCost)}</td>
                  <td className={`px-4 py-2.5 text-right font-black ${c.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{fmtR(c.profit)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      c.margin >= 30 ? "bg-green-100 text-green-700" : c.margin >= 10 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                    }`}>
                      {c.margin}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted border-t-2 border-border">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-bold text-foreground">Total ({data.clientList.length} clientes)</td>
                <td className="px-4 py-3 text-right font-black text-green-600">{fmtR(data.totals.revenue)}</td>
                <td className="px-4 py-3 text-right font-bold text-destructive">{fmtR(data.totals.expense)}</td>
                <td className="px-4 py-3 text-right font-bold text-amber-600">{fmtR(data.totals.hourCost)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{data.totals.hours.toFixed(1)}h</td>
                <td className="px-4 py-3 text-right font-black text-destructive">{fmtR(data.totals.totalCost)}</td>
                <td className={`px-4 py-3 text-right font-black ${data.totals.profit >= 0 ? "text-green-600" : "text-destructive"}`}>{fmtR(data.totals.profit)}</td>
                <td className="px-4 py-3 text-right font-bold text-primary">{data.totals.margin}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}