import { useState } from "react";
import { CheckCircle2, Circle, AlertTriangle, ChevronDown } from "lucide-react";

// Atividades-chave que queremos rastrear por cliente
const KEY_ACTIVITIES = [
  { key: "captacao",             short: "Captação" },
  { key: "reuniao_relatorio",    short: "Reunião de Relatório" },
  { key: "feedback_semanal",     short: "Feedback Semanal" },
  { key: "reuniao_cronograma",   short: "Reunião de Cronograma" },
];

export default function ClientKeyActivities({ monthEvents, clients = [] }) {
  const [open, setOpen] = useState(false);
  // Agrupa por cliente e conta cada atividade-chave
  const byClient = {};

  // Primeiro adiciona TODOS os clientes ativos
  clients.forEach(c => {
    byClient[c.id] = {
      name: c.name,
      counts: {},
    };
  });

  // Depois conta os eventos
  monthEvents.forEach(ev => {
    if (!ev.client_id) return;
    if (!byClient[ev.client_id]) {
      byClient[ev.client_id] = {
        name: ev.client_name,
        counts: {},
      };
    }
    const key = ev.activity_type;
    byClient[ev.client_id].counts[key] = (byClient[ev.client_id].counts[key] || 0) + 1;
  });

  const rows = Object.values(byClient).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div
        className="px-5 py-4 flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="w-7 h-7 bg-teal-500 rounded-lg flex items-center justify-center">
          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Atividades-Chave por Cliente</h3>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        <span className="ml-auto text-[10px] text-muted-foreground font-semibold">{rows.length} clientes</span>
      </div>

      {!open ? null : rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Nenhum cliente cadastrado</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 text-muted-foreground font-semibold">Cliente</th>
                {KEY_ACTIVITIES.map(ka => (
                  <th key={ka.key} className="text-center px-2 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">
                    {ka.short}
                  </th>
                ))}
                <th className="text-center px-3 py-2.5 text-muted-foreground font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(row => {
                const total = KEY_ACTIVITIES.reduce((s, ka) => s + (row.counts[ka.key] || 0), 0);
                const hasZero = KEY_ACTIVITIES.some(ka => (row.counts[ka.key] || 0) === 0);
                return (
                  <tr key={row.name} className={`hover:bg-muted/20 transition-colors ${hasZero ? "bg-amber-50/30 dark:bg-amber-900/5" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-foreground max-w-[160px] truncate">
                      <div className="flex items-center gap-1.5">
                        {hasZero && <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                        {row.name}
                      </div>
                    </td>
                    {KEY_ACTIVITIES.map(ka => {
                      const count = row.counts[ka.key] || 0;
                      return (
                        <td key={ka.key} className="text-center px-2 py-2.5">
                          {count > 0 ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                              {count}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 font-bold text-[11px]">
                              0
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center px-3 py-2.5 font-bold text-foreground">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}