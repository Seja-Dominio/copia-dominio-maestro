import { useMemo } from "react";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TYPE_CONFIG = {
  revenue: { label: "Receita", icon: TrendingUp, color: "text-green-600", bg: "bg-green-100" },
  expense: { label: "Despesa", icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
  transfer: { label: "Transferência", icon: ArrowLeftRight, color: "text-blue-600", bg: "bg-blue-100" },
};
const STATUS_CONFIG = {
  forecast: { label: "Previsto", color: "bg-gray-100 text-gray-600" },
  pending: { label: "A vencer", color: "bg-amber-100 text-amber-700" },
  overdue: { label: "Vencido", color: "bg-red-100 text-red-700" },
  paid: { label: "Quitado", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelado", color: "bg-gray-100 text-gray-400" },
};
const CATEGORY_LABELS = {
  fee: "FEE", production: "Produção", media: "Mídia", supplier: "Fornecedor",
  salary: "Salário", tax: "Imposto", tools: "Ferramentas", rent: "Aluguel", other: "Outros",
};

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function EntriesReport({ entries, period }) {
  const data = useMemo(() => {
    return period
      ? entries.filter(e => {
          const d = e.due_date || e.competence_date || e.payment_date;
          return d && d >= period.start && d <= period.end;
        })
      : entries;
  }, [entries, period]);

  const totalRevenue = data.filter(e => e.type === "revenue").reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpense = data.filter(e => e.type === "expense").reduce((s, e) => s + (e.amount || 0), 0);
  const paidRevenue = data.filter(e => e.type === "revenue" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
  const paidExpense = data.filter(e => e.type === "expense" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);

  if (data.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Nenhum lançamento no período</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Receita Prevista", value: fmtR(totalRevenue), color: "text-green-600" },
          { label: "Receita Realizada", value: fmtR(paidRevenue), color: "text-green-700" },
          { label: "Despesa Prevista", value: fmtR(totalExpense), color: "text-destructive" },
          { label: "Despesa Realizada", value: fmtR(paidExpense), color: "text-red-700" },
        ].map(s => (
          <div key={s.label} className="glass-card p-3.5">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Título</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Categoria</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Vencimento</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Competência</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Valor</th>
              </tr>
            </thead>
            <tbody>
              {data.map(e => {
                const tc = TYPE_CONFIG[e.type] || TYPE_CONFIG.revenue;
                const sc = STATUS_CONFIG[e.status] || STATUS_CONFIG.forecast;
                const TypeIcon = tc.icon;
                return (
                  <tr key={e.id} className="border-b border-border hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className={`w-6 h-6 ${tc.bg} rounded flex items-center justify-center`}>
                        <TypeIcon className={`w-3 h-3 ${tc.color}`} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{e.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{CATEGORY_LABELS[e.category] || e.category || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.client_name || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.due_date ? format(new Date(e.due_date), "dd/MM/yyyy") : "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{e.competence_date ? format(new Date(e.competence_date), "dd/MM/yyyy") : "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={`${sc.color} border-0 text-[10px]`}>{sc.label}</Badge>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold ${e.type === "revenue" ? "text-green-600" : e.type === "expense" ? "text-destructive" : "text-blue-600"}`}>
                      {e.type === "expense" ? "-" : "+"}R$ {(e.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted border-t border-border">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-xs text-muted-foreground">{data.length} lançamentos</td>
                <td className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Saldo</td>
                <td className="px-4 py-3 text-right font-black text-foreground">
                  {fmtR(totalRevenue - totalExpense)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}