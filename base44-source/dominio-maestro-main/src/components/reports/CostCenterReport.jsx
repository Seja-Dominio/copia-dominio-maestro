import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Target, TrendingDown, AlertTriangle } from "lucide-react";

import CostCenterPieChart from "./costCenter/CostCenterPieChart";
import CostCenterBudgetChart from "./costCenter/CostCenterBudgetChart";
import CostCenterTable from "./costCenter/CostCenterTable";
import CostCenterSummaryCards from "./costCenter/CostCenterSummaryCards";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const FALLBACK_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

export default function CostCenterReport({ entries, period }) {
  const [costCenters, setCostCenters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.CostCenter.list("name", 100).then(cc => {
      setCostCenters(cc);
      setLoading(false);
    });
  }, []);

  const data = useMemo(() => {
    const filtered = period
      ? entries.filter(e => {
          const d = e.competence_date || e.due_date || e.payment_date;
          return d && d >= period.start && d <= period.end;
        })
      : entries;

    const expenseEntries = filtered.filter(e => e.type === "expense" && e.status !== "cancelled");

    // Determine number of months in period for budget calculation
    let monthsInPeriod = 1;
    if (period?.start && period?.end) {
      const s = new Date(period.start + "T12:00:00");
      const e = new Date(period.end + "T12:00:00");
      monthsInPeriod = Math.max(1, Math.round((e - s) / (30.44 * 24 * 60 * 60 * 1000)));
    }

    // Build cost center map
    const ccMap = {};

    // Init from CostCenter entity
    costCenters.forEach((cc, i) => {
      ccMap[cc.name] = {
        id: cc.id,
        name: cc.name,
        color: cc.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        budget: (cc.monthly_budget || 0) * monthsInPeriod,
        realized: 0,
        forecast: 0,
        fixed: 0,
        variable: 0,
        items: [],
      };
    });

    // Aggregate entries
    expenseEntries.forEach(e => {
      const ccName = e.cost_center || "Sem centro de custo";
      if (!ccMap[ccName]) {
        ccMap[ccName] = {
          id: null,
          name: ccName,
          color: FALLBACK_COLORS[Object.keys(ccMap).length % FALLBACK_COLORS.length],
          budget: 0,
          realized: 0,
          forecast: 0,
          fixed: 0,
          variable: 0,
          items: [],
        };
      }
      const c = ccMap[ccName];
      if (e.status === "paid") c.realized += (e.amount || 0);
      else c.forecast += (e.amount || 0);
      if (e.expense_type === "fixed") c.fixed += (e.amount || 0);
      else c.variable += (e.amount || 0);
      c.items.push(e);
    });

    // Subcategories
    Object.values(ccMap).forEach(c => {
      const subs = {};
      c.items.forEach(e => {
        const subName = e.subcategory_name || e.category || "Outros";
        if (!subs[subName]) subs[subName] = { name: subName, total: 0 };
        subs[subName].total += (e.amount || 0);
      });
      c.subcategories = Object.values(subs).sort((a, b) => b.total - a.total);
    });

    // Filter out empty centers (no entries and no budget)
    const centers = Object.values(ccMap)
      .filter(c => c.realized + c.forecast > 0 || c.budget > 0)
      .sort((a, b) => (b.realized + b.forecast) - (a.realized + a.forecast));

    const totalRealized = centers.reduce((s, c) => s + c.realized, 0);
    const totalForecast = centers.reduce((s, c) => s + c.forecast, 0);
    const totalBudget = centers.reduce((s, c) => s + c.budget, 0);
    const grandTotal = totalRealized + totalForecast;

    return { centers, totalRealized, totalForecast, totalBudget, grandTotal, monthsInPeriod };
  }, [entries, period, costCenters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (data.centers.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        <Target className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Nenhuma despesa com centro de custo no período</p>
        <p className="text-xs mt-1">Vincule centros de custo aos lançamentos para ver dados aqui</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CostCenterSummaryCards data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CostCenterPieChart centers={data.centers} grandTotal={data.grandTotal} />
        <CostCenterBudgetChart centers={data.centers} />
      </div>

      <CostCenterTable data={data} />
    </div>
  );
}