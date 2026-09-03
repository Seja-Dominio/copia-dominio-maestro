import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function CostCenterTable({ data }) {
  const [expandedRows, setExpandedRows] = useState(new Set());

  const toggleRow = (name) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Centro de Custo</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Orçado</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Realizado</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Previsto</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Fixo</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Variável</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Desvio</th>
              <th className="text-right px-4 py-3 font-semibold text-muted-foreground">%</th>
            </tr>
          </thead>
          <tbody>
            {data.centers.map(c => {
              const total = c.realized + c.forecast;
              const pct = data.grandTotal > 0 ? ((total / data.grandTotal) * 100).toFixed(1) : 0;
              const deviation = c.budget > 0 ? total - c.budget : null;
              const deviationPct = c.budget > 0 ? ((total / c.budget) * 100).toFixed(1) : null;
              const isOverBudget = deviation !== null && deviation > 0;
              const hasSubs = c.subcategories && c.subcategories.length > 1;
              const isExpanded = expandedRows.has(c.name);

              return (
                <>
                  <tr key={c.name} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => hasSubs && toggleRow(c.name)}
                        className="flex items-center gap-2"
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
                        <span className="font-semibold text-foreground">{c.name}</span>
                        {hasSubs && (
                          isExpanded
                            ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right text-blue-600 font-medium">
                      {c.budget > 0 ? fmtR(c.budget) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-destructive font-bold">{fmtR(c.realized)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmtR(c.forecast)}</td>
                    <td className="px-4 py-2.5 text-right text-purple-600 font-medium">{fmtR(c.fixed)}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600 font-medium">{fmtR(c.variable)}</td>
                    <td className="px-4 py-2.5 text-right font-black text-foreground">{fmtR(total)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {deviation !== null ? (
                        <span className={`font-bold ${isOverBudget ? "text-destructive" : "text-green-600"}`}>
                          {isOverBudget ? "+" : ""}{fmtR(deviation)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isOverBudget ? "bg-destructive" : "bg-blue-500"}`}
                            style={{ width: `${Math.min(Number(pct), 100)}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground font-medium w-10 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                  {/* Subcategories */}
                  {hasSubs && isExpanded && c.subcategories.map(s => (
                    <tr key={`${c.name}-${s.name}`} className="border-b border-border/50 bg-muted/20">
                      <td className="px-4 py-1.5 pl-10">
                        <span className="text-[10px] text-muted-foreground">└ {s.name}</span>
                      </td>
                      <td colSpan={5}></td>
                      <td className="px-4 py-1.5 text-right text-[10px] font-semibold text-foreground">{fmtR(s.total)}</td>
                      <td></td>
                      <td className="px-4 py-1.5 text-right text-[10px] text-muted-foreground">
                        {data.grandTotal > 0 ? ((s.total / data.grandTotal) * 100).toFixed(1) : 0}%
                      </td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
          <tfoot className="bg-muted border-t-2 border-border">
            <tr>
              <td className="px-4 py-3 font-bold text-foreground">Total</td>
              <td className="px-4 py-3 text-right font-bold text-blue-600">{fmtR(data.totalBudget)}</td>
              <td className="px-4 py-3 text-right font-black text-destructive">{fmtR(data.totalRealized)}</td>
              <td className="px-4 py-3 text-right font-bold text-amber-600">{fmtR(data.totalForecast)}</td>
              <td className="px-4 py-3 text-right font-bold text-purple-600">
                {fmtR(data.centers.reduce((s, c) => s + c.fixed, 0))}
              </td>
              <td className="px-4 py-3 text-right font-bold text-amber-600">
                {fmtR(data.centers.reduce((s, c) => s + c.variable, 0))}
              </td>
              <td className="px-4 py-3 text-right font-black text-foreground">{fmtR(data.grandTotal)}</td>
              <td className="px-4 py-3 text-right font-bold">
                {data.totalBudget > 0 ? (
                  <span className={data.grandTotal > data.totalBudget ? "text-destructive" : "text-green-600"}>
                    {data.grandTotal > data.totalBudget ? "+" : ""}{fmtR(data.grandTotal - data.totalBudget)}
                  </span>
                ) : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-right font-bold text-muted-foreground">100%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}