import { useMemo } from "react";
import { FileText, AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { createPageUrl } from "@/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ContractExpiryWidget({ entries, clients }) {
  const contractExpiries = useMemo(() => {
    const clientLastDate = {};

    entries
      .filter(e => e.type === "revenue" && e.client_id && e.origin === "fee_contract")
      .forEach(e => {
        const d = e.due_date || e.billing_date || e.competence_date;
        if (!d) return;
        if (!clientLastDate[e.client_id] || d > clientLastDate[e.client_id].date) {
          clientLastDate[e.client_id] = {
            date: d,
            client_name: e.client_name,
            client_id: e.client_id,
          };
        }
      });

    const today = new Date();
    return Object.values(clientLastDate)
      .map(c => {
        const days = differenceInDays(parseISO(c.date), today);
        const client = clients.find(cl => cl.id === c.client_id);
        return { ...c, days, client };
      })
      .filter(c => c.days <= 90)
      .sort((a, b) => a.days - b.days);
  }, [entries, clients]);

  const critical = contractExpiries.filter(c => c.days <= 30).length;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-amber-500 rounded-lg flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-foreground">Vencimentos de Contrato</h3>
          {critical > 0 && (
            <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
              {critical} crítico{critical > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <a href={createPageUrl("Reports")} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 no-underline">
          Ver relatório <ArrowRight className="w-3 h-3" />
        </a>
      </div>

      {contractExpiries.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhum vencimento nos próximos 90 dias
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {contractExpiries.slice(0, 6).map(c => {
              const isExpired = c.days < 0;
              const isCritical = c.days >= 0 && c.days <= 30;
              const isWarning = c.days > 30 && c.days <= 60;

              let badgeClass = "bg-blue-50 text-blue-600";
              let dotClass = "bg-blue-400";
              if (isExpired) { badgeClass = "bg-red-100 text-red-700"; dotClass = "bg-red-500"; }
              else if (isCritical) { badgeClass = "bg-red-100 text-red-700"; dotClass = "bg-red-500"; }
              else if (isWarning) { badgeClass = "bg-amber-100 text-amber-700"; dotClass = "bg-amber-500"; }

              return (
                <div key={c.client_id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{c.client_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Até {format(parseISO(c.date), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${badgeClass}`}>
                    {(isCritical || isExpired) && <AlertTriangle className="w-2.5 h-2.5" />}
                    {isExpired ? `Vencido há ${Math.abs(c.days)}d` : `${c.days}d`}
                  </span>
                </div>
              );
            })}
          </div>
          {contractExpiries.length > 6 && (
            <div className="px-5 py-2.5 border-t border-border">
              <p className="text-[10px] text-muted-foreground">+{contractExpiries.length - 6} contratos com vencimento em até 90 dias</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}