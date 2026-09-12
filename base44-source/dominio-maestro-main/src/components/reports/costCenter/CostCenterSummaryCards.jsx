import { TrendingDown, Target, AlertTriangle, Wallet } from "lucide-react";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function CostCenterSummaryCards({ data }) {
  const overBudgetCount = data.centers.filter(c => c.budget > 0 && (c.realized + c.forecast) > c.budget).length;
  const budgetUsage = data.totalBudget > 0 ? ((data.totalRealized / data.totalBudget) * 100).toFixed(1) : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
            <TrendingDown className="w-3.5 h-3.5 text-destructive" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Realizado</span>
        </div>
        <p className="text-xl font-bold text-destructive">{fmtR(data.totalRealized)}</p>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center">
            <Wallet className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Previsto</span>
        </div>
        <p className="text-xl font-bold text-amber-600">{fmtR(data.totalForecast)}</p>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
            <Target className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Orçado Total</span>
        </div>
        <p className="text-xl font-bold text-blue-600">{fmtR(data.totalBudget)}</p>
        {budgetUsage && (
          <div className="mt-2">
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${Number(budgetUsage) > 100 ? "bg-destructive" : "bg-blue-500"}`}
                style={{ width: `${Math.min(Number(budgetUsage), 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{budgetUsage}% utilizado</p>
          </div>
        )}
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${overBudgetCount > 0 ? "bg-red-100" : "bg-green-100"}`}>
            <AlertTriangle className={`w-3.5 h-3.5 ${overBudgetCount > 0 ? "text-destructive" : "text-green-600"}`} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">Acima do Orçamento</span>
        </div>
        <p className={`text-xl font-bold ${overBudgetCount > 0 ? "text-destructive" : "text-green-600"}`}>
          {overBudgetCount}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {overBudgetCount > 0 ? `${overBudgetCount} centro(s) excederam o orçado` : "Tudo dentro do orçamento"}
        </p>
      </div>
    </div>
  );
}