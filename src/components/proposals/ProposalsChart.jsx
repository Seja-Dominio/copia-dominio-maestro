import { useMemo } from "react";
import { format, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function ProposalsChart({ proposals }) {
  const data = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM/yy", { locale: ptBR });
      months.push({ key, label, enviadas: 0, aprovadas: 0, recusadas: 0, vencidas: 0 });
    }

    proposals.forEach(p => {
      if (!p.created_date) return;
      const m = p.created_date.substring(0, 7);
      const bucket = months.find(x => x.key === m);
      if (!bucket) return;
      const val = p.total_amount || 0;
      if (p.status === "sent" || p.status === "approved" || p.status === "rejected" || p.status === "expired") {
        bucket.enviadas += val;
      }
      if (p.status === "approved") bucket.aprovadas += val;
      if (p.status === "rejected") bucket.recusadas += val;
      if (p.status === "expired") bucket.vencidas += val;
    });

    // Also count drafts that were later sent
    proposals.forEach(p => {
      if (!p.sent_at) return;
      const m = p.sent_at.substring(0, 7);
      const bucket = months.find(x => x.key === m);
      if (bucket && p.status === "draft") bucket.enviadas += (p.total_amount || 0);
    });

    return months;
  }, [proposals]);

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-bold text-foreground mb-4">Evolução Mensal de Propostas</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis
            domain={[0, 100000]}
            ticks={[0, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000]}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11 }}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="enviadas" name="Enviadas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="aprovadas" name="Aprovadas" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="recusadas" name="Recusadas" fill="#ef4444" radius={[4, 4, 0, 0]} />
          <Bar dataKey="vencidas" name="Vencidas" fill="#f97316" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}