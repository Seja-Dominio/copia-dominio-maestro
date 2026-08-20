import { useMemo } from "react";
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

const ACCOUNT_COLORS = ["#6366f1", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6"];

export default function AccountsReport({ accounts, entries, period }) {
  const data = useMemo(() => {
    const filteredEntries = period
      ? entries.filter(e => {
          const d = e.due_date || e.competence_date || e.payment_date;
          return d && d >= period.start && d <= period.end;
        })
      : entries;

    return accounts.filter(a => a.is_active !== false).map((account, idx) => {
      const accountEntries = filteredEntries.filter(e => e.bank_account_id === account.id);
      const realized = accountEntries.filter(e => e.type === "revenue" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
      const expenses = accountEntries.filter(e => e.type === "expense" && e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
      const forecast = accountEntries.filter(e => e.type === "revenue" && e.status !== "paid" && e.status !== "cancelled").reduce((s, e) => s + (e.amount || 0), 0);
      const forecastExp = accountEntries.filter(e => e.type === "expense" && e.status !== "paid" && e.status !== "cancelled").reduce((s, e) => s + (e.amount || 0), 0);
      const transfers = accountEntries.filter(e => e.type === "transfer").reduce((s, e) => s + (e.amount || 0), 0);
      return {
        ...account,
        realized, expenses, forecast, forecastExp, transfers,
        balance: account.balance || 0,
        color: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length],
      };
    });
  }, [accounts, entries, period]);

  const totalBalance = data.reduce((s, a) => s + a.balance, 0);

  const chartData = data.map(a => ({
    name: a.name,
    "Saldo Atual": a.balance,
    "Realizado": a.realized - a.expenses,
    "Previsto": a.forecast - a.forecastExp,
  }));

  return (
    <div className="space-y-5">
      {/* Total Balance */}
      <div className="glass-card p-5 bg-primary/5 border-primary/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Saldo Total Consolidado</p>
        <p className="text-3xl font-black text-primary">{fmtR(totalBalance)}</p>
        <p className="text-xs text-muted-foreground mt-1">{data.length} contas ativas</p>
      </div>

      {/* Chart */}
      {data.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-bold text-foreground mb-4">Saldo por Conta</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmtR(v)} />
              <Bar dataKey="Saldo Atual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Realizado" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Accounts cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.map(account => (
          <div key={account.id} className="glass-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border" style={{ borderLeftWidth: 4, borderLeftColor: account.color }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: account.color + "22" }}>
                <Wallet className="w-4.5 h-4.5" style={{ color: account.color }} />
              </div>
              <div>
                <p className="font-bold text-foreground text-sm">{account.name}</p>
                <p className="text-[10px] text-muted-foreground">{account.bank_name || account.account_type}</p>
              </div>
              <p className={`ml-auto text-lg font-black ${account.balance >= 0 ? "text-green-600" : "text-destructive"}`}>
                {fmtR(account.balance)}
              </p>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground"><TrendingUp className="w-3 h-3 text-green-500" />Receita Realizada</span>
                <span className="font-bold text-green-600">{fmtR(account.realized)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground"><TrendingDown className="w-3 h-3 text-destructive" />Despesa Realizada</span>
                <span className="font-bold text-destructive">{fmtR(account.expenses)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Receita Prevista</span>
                <span className="font-semibold text-foreground">{fmtR(account.forecast)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Despesa Prevista</span>
                <span className="font-semibold text-foreground">{fmtR(account.forecastExp)}</span>
              </div>
              {account.transfers > 0 && (
                <div className="flex justify-between text-xs border-t border-border pt-1.5">
                  <span className="flex items-center gap-1 text-muted-foreground"><ArrowLeftRight className="w-3 h-3 text-blue-500" />Transferências</span>
                  <span className="font-semibold text-blue-600">{fmtR(account.transfers)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}