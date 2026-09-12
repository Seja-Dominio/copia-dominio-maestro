import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground">{d.name}</p>
      <p className="text-muted-foreground">{fmtR(d.value)} ({((d.value / d.payload.grandTotal) * 100).toFixed(1)}%)</p>
    </div>
  );
};

export default function CostCenterPieChart({ centers, grandTotal }) {
  const chartData = centers
    .filter(c => (c.realized + c.forecast) > 0)
    .map(c => ({
      name: c.name,
      value: c.realized + c.forecast,
      color: c.color,
      grandTotal,
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-foreground mb-4">Distribuição por Centro de Custo</h3>
      <div className="flex flex-col items-center gap-4">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={50}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-3 justify-center">
          {chartData.map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
              <span className="text-[11px] text-muted-foreground">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}