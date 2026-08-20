import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Users } from "lucide-react";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const CATEGORY_LABELS = {
  fee: "FEE", production: "Produção", media: "Mídia", supplier: "Fornecedor", other: "Outros",
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function BillingReport({ entries, period }) {
  const data = useMemo(() => {
    const revenueEntries = entries.filter(e => e.type === "revenue");
    const filtered = period
      ? revenueEntries.filter(e => {
          const d = e.due_date || e.competence_date || e.payment_date;
          return d && d >= period.start && d <= period.end;
        })
      : revenueEntries;

    const totalPaid = filtered.filter(e => e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
    const totalForecast = filtered.filter(e => e.status !== "paid" && e.status !== "cancelled").reduce((s, e) => s + (e.amount || 0), 0);

    // By category
    const byCategory = {};
    filtered.forEach(e => {
      const cat = e.category || "other";
      const label = CATEGORY_LABELS[cat] || cat;
      if (!byCategory[cat]) byCategory[cat] = { name: label, paid: 0, forecast: 0 };
      if (e.status === "paid") byCategory[cat].paid += (e.amount || 0);
      else if (e.status !== "cancelled") byCategory[cat].forecast += (e.amount || 0);
    });
    const categories = Object.values(byCategory).sort((a, b) => (b.paid + b.forecast) - (a.paid + a.forecast));

    // By client
    const byClient = {};
    filtered.forEach(e => {
      const clientName = e.client_name || "Sem cliente";
      if (!byClient[clientName]) byClient[clientName] = { name: clientName, paid: 0, forecast: 0, count: 0 };
      if (e.status === "paid") byClient[clientName].paid += (e.amount || 0);
      else if (e.status !== "cancelled") byClient[clientName].forecast += (e.amount || 0);
      byClient[clientName].count++;
    });
    const clientList = Object.values(byClient).sort((a, b) => (b.paid + b.forecast) - (a.paid + a.forecast));

    // By month
    const monthMap = {};
    filtered.forEach(e => {
      const d = e.due_date || e.competence_date;
      if (!d) return;
      const key = d.slice(0, 7);
      if (!monthMap[key]) monthMap[key] = { month: key, paid: 0, forecast: 0 };
      if (e.status === "paid") monthMap[key].paid += (e.amount || 0);
      else if (e.status !== "cancelled") monthMap[key].forecast += (e.amount || 0);
    });
    const monthData = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({
      ...m,
      label: MONTHS[parseInt(m.month.slice(5, 7)) - 1] + "/" + m.month.slice(2, 4),
    }));

    // Pie data
    const pieData = categories.map(c => ({ name: c.name, value: c.paid + c.forecast })).filter(p => p.value > 0);

    return { totalPaid, totalForecast, categories, clientList, monthData, pieData, count: filtered.length };
  }, [entries, period]);

  if (data.count === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhuma receita no período</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-green-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-green-600" /></div>
            <span className="text-xs text-muted-foreground font-medium">Faturamento Realizado</span>
          </div>
          <p className="text-xl font-black text-green-600">{fmtR(data.totalPaid)}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-amber-600" /></div>
            <span className="text-xs text-muted-foreground font-medium">Faturamento Previsto</span>
          </div>
          <p className="text-xl font-black text-amber-600">{fmtR(data.totalForecast)}</p>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center"><Users className="w-3.5 h-3.5 text-primary" /></div>
            <span className="text-xs text-muted-foreground font-medium">Total Geral</span>
          </div>
          <p className="text-xl font-black text-primary">{fmtR(data.totalPaid + data.totalForecast)}</p>
          <p className="text-xs text-muted-foreground mt-1">{data.count} lançamentos</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">Faturamento Mensal</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.monthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmtR(v)} />
              <Legend />
              <Bar dataKey="paid" fill="#22c55e" radius={[4, 4, 0, 0]} name="Realizado" />
              <Bar dataKey="forecast" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Previsto" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">Por Categoria</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data.pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {data.pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => fmtR(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Client Table */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Faturamento por Cliente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Realizado</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Previsto</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">%</th>
              </tr>
            </thead>
            <tbody>
              {data.clientList.map((c, i) => {
                const total = c.paid + c.forecast;
                const grandTotal = data.totalPaid + data.totalForecast;
                const pct = grandTotal > 0 ? ((total / grandTotal) * 100).toFixed(1) : 0;
                return (
                  <tr key={c.name} className="border-b border-border">
                    <td className="px-4 py-2.5 text-muted-foreground font-bold">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-foreground">{c.name}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-bold">{fmtR(c.paid)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmtR(c.forecast)}</td>
                    <td className="px-4 py-2.5 text-right font-black text-foreground">{fmtR(total)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}