import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingDown, Clock } from "lucide-react";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const CATEGORY_LABELS = {
  fee: "FEE", production: "Produção", media: "Mídia", supplier: "Fornecedor",
  salary: "Salário", tax: "Imposto", tools: "Ferramentas", rent: "Aluguel", other: "Outros",
};

export default function ClientCostReport({ entries, timesheets, collaborators, period }) {
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

    const rateMap = {};
    (collaborators || []).forEach(c => { rateMap[c.id] = c.hourly_rate || 0; });

    // Build client map with category breakdown
    const clientMap = {};
    filtered.filter(e => e.type === "expense" && e.client_id).forEach(e => {
      if (!clientMap[e.client_id]) clientMap[e.client_id] = { id: e.client_id, name: e.client_name || "—", total: 0, byCategory: {}, hours: 0, hourCost: 0, fixed: 0, variable: 0 };
      const c = clientMap[e.client_id];
      c.total += (e.amount || 0);
      const cat = e.category || "other";
      if (!c.byCategory[cat]) c.byCategory[cat] = 0;
      c.byCategory[cat] += (e.amount || 0);
      if (e.expense_type === "fixed") c.fixed += (e.amount || 0);
      else c.variable += (e.amount || 0);
    });

    filteredTs.forEach(t => {
      if (!t.client_id) return;
      if (!clientMap[t.client_id]) clientMap[t.client_id] = { id: t.client_id, name: t.client_name || "—", total: 0, byCategory: {}, hours: 0, hourCost: 0, fixed: 0, variable: 0 };
      const c = clientMap[t.client_id];
      const hours = (t.duration_minutes || 0) / 60;
      c.hours += hours;
      c.hourCost += hours * (rateMap[t.collaborator_id] || 0);
    });

    const clientList = Object.values(clientMap).map(c => ({
      ...c,
      grandTotal: c.total + c.hourCost,
    })).sort((a, b) => b.grandTotal - a.grandTotal);

    const grandTotal = clientList.reduce((s, c) => s + c.grandTotal, 0);
    const totalDirect = clientList.reduce((s, c) => s + c.total, 0);
    const totalHourCost = clientList.reduce((s, c) => s + c.hourCost, 0);
    const totalHours = clientList.reduce((s, c) => s + c.hours, 0);

    const chartData = clientList.slice(0, 12).map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 15) + "…" : c.name,
      despesa_direta: c.total,
      custo_hora: c.hourCost,
    }));

    return { clientList, grandTotal, totalDirect, totalHourCost, totalHours, chartData };
  }, [entries, timesheets, collaborators, period]);

  if (data.clientList.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhuma despesa por cliente no período</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Custo Total", value: fmtR(data.grandTotal), icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
          { label: "Despesa Direta", value: fmtR(data.totalDirect), icon: TrendingDown, color: "text-orange-600", bg: "bg-orange-100" },
          { label: "Custo de Hora", value: fmtR(data.totalHourCost), icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
          { label: "Horas Totais", value: `${data.totalHours.toFixed(1)}h`, icon: Clock, color: "text-primary", bg: "bg-primary/10" },
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
          <h3 className="text-sm font-bold text-foreground mb-4">Custo por Cliente</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.chartData} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip formatter={v => fmtR(v)} />
              <Legend />
              <Bar dataKey="despesa_direta" fill="#ef4444" radius={[0, 4, 4, 0]} name="Despesa Direta" stackId="a" />
              <Bar dataKey="custo_hora" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Custo de Hora" stackId="a" />
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
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Despesa Direta</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Fixo</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Variável</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Horas</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Custo Hora</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Custo Total</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">%</th>
              </tr>
            </thead>
            <tbody>
              {data.clientList.map((c, i) => {
                const pct = data.grandTotal > 0 ? ((c.grandTotal / data.grandTotal) * 100).toFixed(1) : 0;
                return (
                  <tr key={c.id} className="border-b border-border">
                    <td className="px-4 py-2.5 text-muted-foreground font-bold">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-foreground">{c.name}</span>
                      {Object.keys(c.byCategory).length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {Object.entries(c.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, val]) => (
                            <span key={cat} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                              {CATEGORY_LABELS[cat] || cat}: {fmtR(val)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-destructive font-bold">{fmtR(c.total)}</td>
                    <td className="px-4 py-2.5 text-right text-purple-600 font-medium">{fmtR(c.fixed)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmtR(c.variable)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{c.hours.toFixed(1)}h</td>
                    <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmtR(c.hourCost)}</td>
                    <td className="px-4 py-2.5 text-right font-black text-foreground">{fmtR(c.grandTotal)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-destructive rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-muted-foreground w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted border-t-2 border-border">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-bold text-foreground">Total ({data.clientList.length} clientes)</td>
                <td className="px-4 py-3 text-right font-black text-destructive">{fmtR(data.totalDirect)}</td>
                <td className="px-4 py-3 text-right font-bold text-purple-600">
                  {fmtR(data.clientList.reduce((s, c) => s + c.fixed, 0))}
                </td>
                <td className="px-4 py-3 text-right font-bold text-amber-600">
                  {fmtR(data.clientList.reduce((s, c) => s + c.variable, 0))}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">{data.totalHours.toFixed(1)}h</td>
                <td className="px-4 py-3 text-right font-bold text-amber-600">{fmtR(data.totalHourCost)}</td>
                <td className="px-4 py-3 text-right font-black text-foreground">{fmtR(data.grandTotal)}</td>
                <td className="px-4 py-3 text-right font-bold text-muted-foreground">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}