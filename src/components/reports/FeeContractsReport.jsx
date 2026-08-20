import { useMemo } from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";

export default function FeeContractsReport({ entries, clients, period }) {
  const contractData = useMemo(() => {
    const clientMap = {};

    const filtered = period
      ? entries.filter(e => { const d = e.due_date || e.billing_date || e.competence_date; return d && d >= period.start && d <= period.end; })
      : entries;

    filtered
      .filter(e => e.type === "revenue" && e.client_id && e.origin === "fee_contract")
      .forEach(e => {
        const d = e.due_date || e.billing_date || e.competence_date;
        if (!d) return;
        if (!clientMap[e.client_id]) {
          clientMap[e.client_id] = {
            client_id: e.client_id,
            client_name: e.client_name,
            entries: [],
            lastDate: d,
            firstDate: d,
            totalAmount: 0,
          };
        }
        clientMap[e.client_id].entries.push(e);
        clientMap[e.client_id].totalAmount += e.amount || 0;
        if (d > clientMap[e.client_id].lastDate) clientMap[e.client_id].lastDate = d;
        if (d < clientMap[e.client_id].firstDate) clientMap[e.client_id].firstDate = d;
      });

    const today = new Date();
    return Object.values(clientMap)
      .map(c => {
        const daysUntilExpiry = differenceInDays(parseISO(c.lastDate), today);
        const client = clients?.find(cl => cl.id === c.client_id);
        return {
          ...c,
          daysUntilExpiry,
          client,
          monthsCount: c.entries.length,
          monthlyAvg: c.totalAmount / Math.max(c.entries.length, 1),
        };
      })
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }, [entries, clients, period]);

  const expired = contractData.filter(c => c.daysUntilExpiry < 0);
  const critical = contractData.filter(c => c.daysUntilExpiry >= 0 && c.daysUntilExpiry <= 30);
  const warning = contractData.filter(c => c.daysUntilExpiry > 30 && c.daysUntilExpiry <= 60);
  const ok = contractData.filter(c => c.daysUntilExpiry > 60);

  const totalMonthlyFee = contractData
    .filter(c => c.daysUntilExpiry >= 0)
    .reduce((s, c) => s + c.monthlyAvg, 0);

  function StatusBadge({ days }) {
    if (days < 0) return (
      <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-2.5 h-2.5" /> Vencido
      </span>
    );
    if (days <= 30) return (
      <span className="flex items-center gap-1 text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-2.5 h-2.5" /> {days}d
      </span>
    );
    if (days <= 60) return (
      <span className="flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
        <Clock className="w-2.5 h-2.5" /> {days}d
      </span>
    );
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
        <CheckCircle className="w-2.5 h-2.5" /> {days}d
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total de Contratos</p>
          <p className="text-2xl font-black text-foreground mt-1">{contractData.length}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Fee Mensal Total</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">
            R${totalMonthlyFee.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className={`glass-card p-4 ${critical.length + expired.length > 0 ? "border-red-200 bg-red-50 dark:bg-red-900/10" : ""}`}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Críticos (≤30d)</p>
          <p className={`text-2xl font-black mt-1 ${critical.length + expired.length > 0 ? "text-red-600" : "text-foreground"}`}>
            {critical.length + expired.length}
          </p>
        </div>
        <div className={`glass-card p-4 ${warning.length > 0 ? "border-amber-200 bg-amber-50 dark:bg-amber-900/10" : ""}`}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Atenção (31–60d)</p>
          <p className={`text-2xl font-black mt-1 ${warning.length > 0 ? "text-amber-600" : "text-foreground"}`}>
            {warning.length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground text-sm">Contratos de Fee — Próximos Vencimentos</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Baseado na data do último lançamento de receita de fee por cliente
          </p>
        </div>
        {contractData.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Nenhum lançamento de receita do tipo "fee_contract" encontrado no período selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Tier</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Fee Médio/Mês</th>
                  <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Total Contrato</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Início</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Término</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contractData.map(c => (
                  <tr key={c.client_id} className={`hover:bg-muted/30 transition-colors ${
                    c.daysUntilExpiry < 0 ? "bg-red-50/50 dark:bg-red-900/10" :
                    c.daysUntilExpiry <= 30 ? "bg-red-50/30 dark:bg-red-900/5" :
                    c.daysUntilExpiry <= 60 ? "bg-amber-50/30 dark:bg-amber-900/5" : ""
                  }`}>
                    <td className="px-4 py-3 font-semibold text-foreground">{c.client_name}</td>
                    <td className="px-4 py-3">
                      {c.client?.tier === "elite" ? (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Elite</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Padrão</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      R${c.monthlyAvg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">
                      R${c.totalAmount.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {format(parseISO(c.firstDate), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-foreground">
                      {format(parseISO(c.lastDate), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge days={c.daysUntilExpiry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}