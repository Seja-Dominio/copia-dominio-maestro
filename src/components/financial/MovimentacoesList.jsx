import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { TrendingUp, TrendingDown, ArrowLeftRight, DollarSign } from "lucide-react";

const TYPE_CONFIG = {
  revenue: { label: "Receita", icon: TrendingUp, color: "text-green-600", bg: "bg-green-100" },
  expense: { label: "Despesa", icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
  transfer: { label: "Transferência", icon: ArrowLeftRight, color: "text-blue-600", bg: "bg-blue-100" },
};

const STATUS_CONFIG = {
  forecast: { label: "A realizar", color: "bg-blue-100 text-blue-700" },
  pending: { label: "A realizar", color: "bg-blue-100 text-blue-700" },
  overdue: { label: "Vencido", color: "bg-red-100 text-red-700" },
  paid: { label: "Realizado", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelado", color: "bg-gray-100 text-gray-400" },
};

const CATEGORY_LABELS = {
  fee: "FEE", production: "Produção", media: "Mídia", supplier: "Fornecedor",
  salary: "Salário", tax: "Imposto", tools: "Ferramentas", rent: "Aluguel", other: "Outros",
};

export default function MovimentacoesList({ entries, loading }) {
  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nenhuma movimentação encontrada</p>
      </div>
    );
  }

  // Sort by date descending
  const sorted = [...entries].sort((a, b) => {
    const dateA = a.payment_date || a.due_date || a.competence_date || "";
    const dateB = b.payment_date || b.due_date || b.competence_date || "";
    return dateB.localeCompare(dateA);
  });

  const totalReceitas = sorted.filter(e => e.type === "revenue").reduce((s, e) => s + (e.amount || 0), 0);
  const totalDespesas = sorted.filter(e => e.type === "expense").reduce((s, e) => s + (e.amount || 0), 0);
  const saldo = totalReceitas - totalDespesas;

  return (
    <div>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "90px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "100px" }} />
            <col />
            <col style={{ width: "120px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "100px" }} />
            <col style={{ width: "130px" }} />
            <col style={{ width: "120px" }} />
          </colgroup>
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Data</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Competência</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Pagamento</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Tipo</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Descrição</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Categoria</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
              <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground">Conta</th>
              <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground">Valor</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(e => {
              const tc = TYPE_CONFIG[e.type] || TYPE_CONFIG.revenue;
              const sc = STATUS_CONFIG[e.status] || STATUS_CONFIG.forecast;
              const TypeIcon = tc.icon;
              const fmtDate = (d) => d ? format(new Date(d + "T12:00:00"), "dd/MM/yy") : "—";
              return (
                <tr key={e.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(e.due_date)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(e.competence_date)}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(e.payment_date)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <div className={`w-6 h-6 ${tc.bg} rounded flex items-center justify-center mx-auto`}>
                      <TypeIcon className={`w-3 h-3 ${tc.color}`} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-sm font-medium text-foreground truncate block">
                      {e.title}
                      {e.installment_total > 1 && (
                        <span className="text-muted-foreground font-normal ml-1 text-xs">
                          ({e.installment_current}/{e.installment_total})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-muted-foreground truncate block">
                      {CATEGORY_LABELS[e.category] || e.category || "—"}
                      {e.subcategory_name && <span className="block text-[10px]">└ {e.subcategory_name}</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground truncate">{e.client_name || "—"}</td>
                  <td className="px-3 py-2.5 text-center">
                    <Badge className={`${sc.color} border-0 text-[10px] px-1.5`}>{sc.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground truncate">{e.bank_account_name || "—"}</td>
                  <td className={`px-3 py-2.5 text-right font-bold text-sm whitespace-nowrap ${
                    e.type === "revenue" ? "text-green-600" : e.type === "expense" ? "text-destructive" : "text-blue-600"
                  }`}>
                    {e.type === "expense" ? "−" : "+"}R$ {(e.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted border-t-2 border-border">
            <tr>
              <td colSpan={5} className="px-3 py-3 text-xs text-muted-foreground font-medium">
                {sorted.length} movimentações
              </td>
              <td colSpan={2} className="px-3 py-3 text-right">
                <span className="text-xs text-green-600 font-semibold mr-4">
                  +R$ {totalReceitas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-destructive font-semibold">
                  −R$ {totalDespesas.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </td>
              <td className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground">Saldo</td>
              <td colSpan={2} className={`px-3 py-3 text-right font-bold text-sm ${saldo >= 0 ? "text-green-600" : "text-destructive"}`}>
                R$ {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-border">
        {sorted.map(e => {
          const tc = TYPE_CONFIG[e.type] || TYPE_CONFIG.revenue;
          const sc = STATUS_CONFIG[e.status] || STATUS_CONFIG.forecast;
          const TypeIcon = tc.icon;
          const fmtDate = (d) => d ? format(new Date(d + "T12:00:00"), "dd/MM") : "";
          return (
            <div key={e.id} className="p-3 flex items-center gap-3">
              <div className={`w-8 h-8 ${tc.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <TypeIcon className={`w-4 h-4 ${tc.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{e.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">{fmtDate(e.due_date)}</span>
                  {e.client_name && <span className="text-xs text-muted-foreground">• {e.client_name}</span>}
                  <Badge className={`${sc.color} border-0 text-[10px] px-1.5`}>{sc.label}</Badge>
                </div>
              </div>
              <span className={`text-sm font-bold flex-shrink-0 ${
                e.type === "revenue" ? "text-green-600" : e.type === "expense" ? "text-destructive" : "text-blue-600"
              }`}>
                {e.type === "expense" ? "−" : "+"}R$ {(e.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          );
        })}
        <div className="px-3 py-3 bg-muted flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{sorted.length} movimentações</span>
          <span className={`text-sm font-bold ${saldo >= 0 ? "text-green-600" : "text-destructive"}`}>
            Saldo: R$ {saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}