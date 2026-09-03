import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: p.fill || p.color }} />
          {p.name}: {fmtR(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function CostCenterBudgetChart({ centers }) {
  // Only show centers with budget > 0 for meaningful comparison
  const withBudget = centers.filter(c => c.budget > 0);

  const chartData = (withBudget.length > 0 ? withBudget : centers).map(c => ({
    name: c.name.length > 12 ? c.name.slice(0, 12) + "…" : c.name,
    fullName: c.name,
    orcado: c.budget,
    realizado: c.realized,
    previsto: c.forecast,
  }));

  if (chartData.length === 0) return null;

  const hasBudget = withBudget.length > 0;

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-foreground mb-1">
        {hasBudget ? "Orçado vs Realizado" : "Realizado vs Previsto"}
      </h3>
      <p className="text-[11px] text-muted-foreground mb-4">
        {hasBudget
          ? "Comparação do orçamento definido com o gasto real"
          : "Defina orçamentos nos centros de custo para ver a comparação"}
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {hasBudget && (
            <Bar dataKey="orcado" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Orçado" />
          )}
          <Bar dataKey="realizado" fill="#ef4444" radius={[4, 4, 0, 0]} name="Realizado" />
          <Bar dataKey="previsto" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Previsto" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}