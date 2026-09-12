import { useMemo } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function CashFlowReport({ entries, accounts, period }) {
  const data = useMemo(() => {
    const filtered = period
      ? entries.filter(e => {
          const d = e.due_date || e.competence_date || e.payment_date;
          return d && d >= period.start && d <= period.end;
        })
      : entries;

    // Group by month
    const monthMap = {};
    filtered.forEach(e => {
      const d = e.due_date || e.competence_date;
      if (!d) return;
      const monthKey = d.slice(0, 7); // yyyy-MM
      if (!monthMap[monthKey]) monthMap[monthKey] = { month: monthKey, revenue_paid: 0, revenue_forecast: 0, expense_paid: 0, expense_forecast: 0 };
      const m = monthMap[monthKey];
      if (e.type === "revenue") {
        if (e.status === "paid") m.revenue_paid += (e.amount || 0);
        else if (e.status !== "cancelled") m.revenue_forecast += (e.amount || 0);
      }
      if (e.type === "expense") {
        if (e.status === "paid") m.expense_paid += (e.amount || 0);
        else if (e.status !== "cancelled") m.expense_forecast += (e.amount || 0);
      }
    });

    const months = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));

    // Cumulative balance
    let cumulative = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    // Subtract current entries to get starting balance (simplification)
    const startingBalance = cumulative;

    const chartData = months.map(m => {
      const monthIdx = parseInt(m.month.slice(5, 7)) - 1;
      const label = MONTHS[monthIdx] + "/" + m.month.slice(2, 4);
      const totalIn = m.revenue_paid + m.revenue_forecast;
      const totalOut = m.expense_paid + m.expense_forecast;
      const net = totalIn - totalOut;
      return {
        month: label,
        entradas: totalIn,
        saidas: totalOut,
        saldo: net,
        receita_realizada: m.revenue_paid,
        despesa_realizada: m.expense_paid,
      };
    });

    // Cumulative line
    let running = 0;
    chartData.forEach(d => {
      running += d.saldo;
      d.saldo_acumulado = running;
    });

    const totalIn = months.reduce((s, m) => s + m.revenue_paid + m.revenue_forecast, 0);
    const totalOut = months.reduce((s, m) => s + m.expense_paid + m.expense_forecast, 0);
    const totalPaidIn = months.reduce((s, m) => s + m.revenue_paid, 0);
    const totalPaidOut = months.reduce((s, m) => s + m.expense_paid, 0);

    return { chartData, months, totalIn, totalOut, totalPaidIn, totalPaidOut, startingBalance };
  }, [entries, accounts, period]);

  if (data.months.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhum dado no período</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Entradas (Total)", value: fmtR(data.totalIn), icon: TrendingUp, color: "text-green-600", bg: "bg-green-100" },
          { label: "Saídas (Total)", value: fmtR(data.totalOut), icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
          { label: "Saldo Líquido", value: fmtR(data.totalIn - data.totalOut), icon: Wallet, color: data.totalIn - data.totalOut >= 0 ? "text-green-600" : "text-destructive", bg: "bg-blue-100" },
          { label: "Realizado Líquido", value: fmtR(data.totalPaidIn - data.totalPaidOut), icon: Wallet, color: data.totalPaidIn - data.totalPaidOut >= 0 ? "text-green-600" : "text-destructive", bg: "bg-primary/10" },
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

      {/* Bar Chart */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">Entradas x Saídas</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmtR(v)} />
            <Legend />
            <Bar dataKey="entradas" fill="#22c55e" radius={[4, 4, 0, 0]} name="Entradas" />
            <Bar dataKey="saidas" fill="#ef4444" radius={[4, 4, 0, 0]} name="Saídas" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative Line */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">Saldo Acumulado</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data.chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmtR(v)} />
            <Line type="monotone" dataKey="saldo_acumulado" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Saldo Acumulado" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Mês</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Entradas</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Saídas</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Saldo Mensal</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {data.chartData.map(m => (
                <tr key={m.month} className="border-b border-border">
                  <td className="px-4 py-2.5 font-semibold text-foreground">{m.month}</td>
                  <td className="px-4 py-2.5 text-right text-green-600 font-bold">{fmtR(m.entradas)}</td>
                  <td className="px-4 py-2.5 text-right text-destructive font-bold">{fmtR(m.saidas)}</td>
                  <td className={`px-4 py-2.5 text-right font-bold ${m.saldo >= 0 ? "text-green-600" : "text-destructive"}`}>{fmtR(m.saldo)}</td>
                  <td className={`px-4 py-2.5 text-right font-black ${m.saldo_acumulado >= 0 ? "text-primary" : "text-destructive"}`}>{fmtR(m.saldo_acumulado)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted border-t-2 border-border">
              <tr>
                <td className="px-4 py-3 font-bold text-foreground">Total</td>
                <td className="px-4 py-3 text-right font-black text-green-600">{fmtR(data.totalIn)}</td>
                <td className="px-4 py-3 text-right font-black text-destructive">{fmtR(data.totalOut)}</td>
                <td className={`px-4 py-3 text-right font-black ${data.totalIn - data.totalOut >= 0 ? "text-green-600" : "text-destructive"}`}>{fmtR(data.totalIn - data.totalOut)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}