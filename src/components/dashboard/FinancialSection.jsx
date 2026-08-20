import { useState } from "react";
import { TrendingUp, DollarSign, ArrowRight, ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { createPageUrl } from "@/utils";
import CashFlowChart from "@/components/dashboard/CashFlowChart";

function fmt(v) {
  if (v >= 1000000) return `R$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `R$${(v / 1000).toFixed(1)}k`;
  return `R$${v.toFixed(0)}`;
}

export default function FinancialSection({ totalRevenue, totalExpense, profitability, monthlyRevenueForecast, entries }) {
  const [collapsed, setCollapsed] = useState(false);
  const netResult = totalRevenue - totalExpense;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center">
            <DollarSign className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Financeiro</h3>
        </div>
        <div className="flex items-center gap-2">
          <a href={createPageUrl("Financial")} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 no-underline">
            Ver detalhes <ArrowRight className="w-3 h-3" />
          </a>
          <button onClick={() => setCollapsed(c => !c)} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors no-touch-min">
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Receita Realizada */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider">Receita Realizada</p>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{fmt(totalRevenue)}</p>
            </div>

            {/* Despesa Realizada */}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-[10px] text-red-600 dark:text-red-400 font-semibold uppercase tracking-wider">Despesa Realizada</p>
              <p className="text-xl font-black text-red-700 dark:text-red-300 mt-1">{fmt(totalExpense)}</p>
            </div>

            {/* Faturamento Previsto */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider">Faturamento Previsto</p>
              <p className="text-xl font-black text-blue-700 dark:text-blue-300 mt-1">{fmt(monthlyRevenueForecast)}</p>
            </div>

            {/* Lucratividade */}
            <div className={`${Number(profitability) >= 30 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : Number(profitability) >= 10 ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"} border rounded-xl p-3`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Lucratividade</p>
              <p className={`text-xl font-black mt-1 ${Number(profitability) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{profitability}%</p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full rounded-full ${Number(profitability) >= 30 ? "bg-emerald-500" : Number(profitability) >= 10 ? "bg-amber-500" : "bg-destructive"}`}
                  style={{ width: `${Math.min(Math.max(Number(profitability), 0), 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Resultado Líquido */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border">
            <TrendingUp className={`w-5 h-5 ${netResult >= 0 ? "text-emerald-500" : "text-destructive"}`} />
            <div>
              <p className="text-xs text-muted-foreground font-medium">Resultado Líquido (mês)</p>
              <p className={`text-lg font-bold ${netResult >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                {netResult >= 0 ? "+" : ""}{fmt(Math.abs(netResult))}
              </p>
            </div>
          </div>

          {/* Cash Flow Chart */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Fluxo de Caixa</p>
            <CashFlowChart entries={entries} monthsBack={6} />
          </div>
        </div>
      )}
    </div>
  );
}