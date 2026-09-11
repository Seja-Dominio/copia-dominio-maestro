import { useMemo } from "react";
import { Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { buildFinancialForecast } from "@/lib/financialForecast";

const formatBRL = value => `R$ ${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export default function FinancialForecastChart({ entries, months = 6 }) {
  entries = Array.isArray(entries) ? entries : [];
  const data = useMemo(() => buildFinancialForecast(entries, { months }).map(row => ({
    ...row,
    label: new Date(`${row.month}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    receita: row.revenueRealized + row.revenueForecast,
    custos: -(row.expenseRealized + row.expenseForecast),
  })), [entries, months]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={formatBRL} tick={{ fontSize: 10 }} width={58} />
        <Tooltip formatter={value => formatBRL(Math.abs(value))} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="receita" fill="#22c55e" radius={[4, 4, 0, 0]} name="Receita projetada" />
        <Bar dataKey="custos" fill="#ef4444" radius={[0, 0, 4, 4]} name="Custos projetados" />
        <Line dataKey="accumulated" stroke="#f59e0b" strokeWidth={2} dot={false} name="Saldo acumulado" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
