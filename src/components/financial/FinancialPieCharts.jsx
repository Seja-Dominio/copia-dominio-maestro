import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const CATEGORY_LABELS = {
  fee: "FEE",
  production: "Produção",
  media: "Mídia",
  supplier: "Fornecedor",
  salary: "Salário",
  tax: "Imposto",
  tools: "Ferramentas",
  rent: "Aluguel",
  other: "Outros",
};

const EXPENSE_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#64748b", "#10b981", "#6366f1",
];

const REVENUE_COLORS = [
  "#22c55e", "#10b981", "#14b8a6", "#0ea5e9",
  "#6366f1", "#8b5cf6", "#a855f7", "#f59e0b", "#64748b",
];

const ACCOUNT_COLORS = [
  "#8b5cf6", "#3b82f6", "#22c55e", "#f59e0b", "#ec4899",
  "#06b6d4", "#ef4444", "#64748b",
];

function fmt(v) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.[0]) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-800">{d.name}</p>
      <p className="text-gray-600">{fmt(d.value)} ({d.payload.pct}%)</p>
    </div>
  );
};

const renderLabel = ({ name, pct, cx, x }) => {
  if (pct < 5) return null;
  return (
    <text x={x} y={0} fill="#475569" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10} fontWeight={600}>
      {pct}%
    </text>
  );
};

function MiniPie({ title, data, colors, emptyMsg }) {
  if (!data || data.length === 0) {
    return (
      <div className="glass-card p-4 flex flex-col items-center justify-center min-h-[260px]">
        <p className="text-xs font-bold text-muted-foreground mb-2">{title}</p>
        <p className="text-xs text-muted-foreground">{emptyMsg || "Sem dados"}</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <p className="text-xs font-bold text-foreground mb-3 text-center">{title}</p>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
            label={renderLabel}
            labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FinancialPieCharts({ entries, accounts }) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const isCurrentMonth = (dateStr) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  const monthEntries = useMemo(() =>
    entries.filter(e => {
      const date = e.competence_date || e.due_date || e.payment_date;
      return date && isCurrentMonth(date) && e.status === "paid";
    }),
    [entries, currentMonth, currentYear]
  );

  // Despesas por categoria
  const expenseData = useMemo(() => {
    const map = {};
    monthEntries.filter(e => e.type === "expense").forEach(e => {
      const cat = e.category || "other";
      const label = CATEGORY_LABELS[cat] || cat;
      map[label] = (map[label] || 0) + (e.amount || 0);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? Math.round(value / total * 100) : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [monthEntries]);

  // Receitas por categoria
  const revenueData = useMemo(() => {
    const map = {};
    monthEntries.filter(e => e.type === "revenue").forEach(e => {
      const label = e.client_name || CATEGORY_LABELS[e.category] || "Outros";
      map[label] = (map[label] || 0) + (e.amount || 0);
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: total > 0 ? Math.round(value / total * 100) : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [monthEntries]);

  // Saldo por conta
  const accountData = useMemo(() => {
    return accounts
      .filter(a => a.is_active !== false)
      .map(a => ({
        name: a.name || a.bank_name || "Conta",
        value: Math.abs(a.balance || 0),
        pct: 0,
      }))
      .filter(a => a.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [accounts]);

  // Calcular percentuais das contas
  const accountTotal = accountData.reduce((s, d) => s + d.value, 0);
  const accountDataWithPct = accountData.map(d => ({ ...d, pct: accountTotal > 0 ? Math.round(d.value / accountTotal * 100) : 0 }));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
      <MiniPie
        title="Despesas por Categoria"
        data={expenseData}
        colors={EXPENSE_COLORS}
        emptyMsg="Sem despesas realizadas no mês"
      />
      <MiniPie
        title="Receitas por Cliente"
        data={revenueData}
        colors={REVENUE_COLORS}
        emptyMsg="Sem receitas realizadas no mês"
      />
      <MiniPie
        title="Saldo por Conta"
        data={accountDataWithPct}
        colors={ACCOUNT_COLORS}
        emptyMsg="Sem contas bancárias"
      />
    </div>
  );
}