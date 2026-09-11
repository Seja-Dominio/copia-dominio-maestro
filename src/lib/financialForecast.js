const FUTURE_STATUSES = new Set(["pending", "forecast", "overdue"]);

function monthKey(date) {
  return date.slice(0, 7);
}
function addMonths(date, count) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count, 1);
  return next;
}

export function buildFinancialForecast(entries, { months = 6, startDate = new Date() } = {}) {
  const start = new Date(startDate);
  start.setDate(1);
  const rows = Array.from({ length: months }, (_, index) => {
    const date = addMonths(start, index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { month: key, revenueRealized: 0, revenueForecast: 0, expenseRealized: 0, expenseForecast: 0 };
  });
  const byMonth = new Map(rows.map(row => [row.month, row]));

  entries.forEach(entry => {
    if (entry.type !== "revenue" && entry.type !== "expense") return;
    const date = entry.due_date || entry.competence_date || entry.payment_date;
    if (!date) return;
    const row = byMonth.get(monthKey(date));
    if (!row) return;
    const amount = Number(entry.amount) || 0;
    const prefix = entry.type === "revenue" ? "revenue" : "expense";
    if (entry.status === "paid") row[`${prefix}Realized`] += amount;
    else if (FUTURE_STATUSES.has(entry.status)) row[`${prefix}Forecast`] += amount;
  });

  let accumulated = 0;
  return rows.map(row => {
    const projectedNet = row.revenueRealized + row.revenueForecast - row.expenseRealized - row.expenseForecast;
    accumulated += projectedNet;
    return { ...row, projectedNet, accumulated };
  });
}
