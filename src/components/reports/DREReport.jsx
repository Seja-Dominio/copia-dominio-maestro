import { useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CATEGORY_LABELS = {
  fee: "FEE", production: "Produção", media: "Mídia", supplier: "Fornecedor",
  salary: "Salário", tax: "Imposto", tools: "Ferramentas", rent: "Aluguel", other: "Outros",
};

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function DREReport({ entries, period }) {
  const data = useMemo(() => {
    const filtered = period
      ? entries.filter(e => {
          const d = e.competence_date || e.due_date || e.payment_date;
          return d && d >= period.start && d <= period.end;
        })
      : entries;

    const revenues = filtered.filter(e => e.type === "revenue");
    const expenses = filtered.filter(e => e.type === "expense");

    const revByCategory = {};
    revenues.forEach(e => {
      const cat = e.category || "other";
      if (!revByCategory[cat]) revByCategory[cat] = { label: CATEGORY_LABELS[cat] || cat, paid: 0, forecast: 0 };
      if (e.status === "paid") revByCategory[cat].paid += (e.amount || 0);
      else revByCategory[cat].forecast += (e.amount || 0);
    });

    const expByCategory = {};
    expenses.forEach(e => {
      const cat = e.category || "other";
      if (!expByCategory[cat]) expByCategory[cat] = { label: CATEGORY_LABELS[cat] || cat, paid: 0, forecast: 0 };
      if (e.status === "paid") expByCategory[cat].paid += (e.amount || 0);
      else expByCategory[cat].forecast += (e.amount || 0);
    });

    const totalRevPaid = revenues.filter(e => e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
    const totalRevForecast = revenues.filter(e => e.status !== "paid" && e.status !== "cancelled").reduce((s, e) => s + (e.amount || 0), 0);
    const totalExpPaid = expenses.filter(e => e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
    const totalExpForecast = expenses.filter(e => e.status !== "paid" && e.status !== "cancelled").reduce((s, e) => s + (e.amount || 0), 0);

    const grossProfit = totalRevPaid - totalExpPaid;
    const margin = totalRevPaid > 0 ? ((grossProfit / totalRevPaid) * 100).toFixed(1) : 0;

    // Monthly chart
    const months = {};
    filtered.forEach(e => {
      const d = e.competence_date || e.due_date;
      if (!d) return;
      const month = d.slice(0, 7);
      if (!months[month]) months[month] = { month, receita: 0, despesa: 0 };
      if (e.type === "revenue" && e.status === "paid") months[month].receita += (e.amount || 0);
      if (e.type === "expense" && e.status === "paid") months[month].despesa += (e.amount || 0);
    });

    return {
      revByCategory: Object.values(revByCategory).sort((a, b) => b.paid - a.paid),
      expByCategory: Object.values(expByCategory).sort((a, b) => b.paid - a.paid),
      totalRevPaid, totalRevForecast, totalExpPaid, totalExpForecast,
      grossProfit, margin,
      chartData: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)),
    };
  }, [entries, period]);

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Receita Realizada", value: fmtR(data.totalRevPaid), icon: TrendingUp, color: "text-green-600", bg: "bg-green-100" },
          { label: "Despesa Realizada", value: fmtR(data.totalExpPaid), icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
          { label: "Resultado Bruto", value: fmtR(data.grossProfit), icon: DollarSign, color: data.grossProfit >= 0 ? "text-green-600" : "text-destructive", bg: data.grossProfit >= 0 ? "bg-green-100" : "bg-red-100" },
          { label: "Margem", value: `${data.margin}%`, icon: TrendingUp, color: Number(data.margin) >= 30 ? "text-green-600" : Number(data.margin) >= 10 ? "text-amber-600" : "text-destructive", bg: "bg-primary/10" },
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
          <h3 className="text-sm font-bold text-foreground mb-4">Receitas x Despesas por Competência</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmtR(v)} />
              <Legend />
              <Bar dataKey="receita" fill="#22c55e" radius={[4, 4, 0, 0]} name="Receita" />
              <Bar dataKey="despesa" fill="#ef4444" radius={[4, 4, 0, 0]} name="Despesa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tables side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenues */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-green-50 dark:bg-green-900/20 border-b border-border">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <h3 className="text-sm font-bold text-green-700 dark:text-green-400">Receitas por Categoria</h3>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Categoria</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Realizado</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Previsto</th>
              </tr>
            </thead>
            <tbody>
              {data.revByCategory.map(r => (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">{r.label}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-bold">{fmtR(r.paid)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtR(r.forecast)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted border-t-2 border-green-200">
              <tr>
                <td className="px-4 py-2.5 font-bold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right font-black text-green-600">{fmtR(data.totalRevPaid)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-muted-foreground">{fmtR(data.totalRevForecast)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Expenses */}
        <div className="glass-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-red-50 dark:bg-red-900/20 border-b border-border">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <h3 className="text-sm font-bold text-red-700 dark:text-red-400">Despesas por Categoria</h3>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Categoria</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Realizado</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground">Previsto</th>
              </tr>
            </thead>
            <tbody>
              {data.expByCategory.map(r => (
                <tr key={r.label} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">{r.label}</td>
                  <td className="px-4 py-2.5 text-right text-destructive font-bold">{fmtR(r.paid)}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtR(r.forecast)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted border-t-2 border-red-200">
              <tr>
                <td className="px-4 py-2.5 font-bold text-foreground">Total</td>
                <td className="px-4 py-2.5 text-right font-black text-destructive">{fmtR(data.totalExpPaid)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-muted-foreground">{fmtR(data.totalExpForecast)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}