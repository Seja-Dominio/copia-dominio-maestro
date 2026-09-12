import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowUpRight, ArrowDownLeft, ArrowRightLeft, ChevronDown, Plus, PiggyBank, ArrowLeftRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SavingsBoxModal from "./SavingsBoxModal";
import SavingsTransferModal from "./SavingsTransferModal";

const TYPE_ICONS = {
  revenue: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowRightLeft,
};

const TYPE_COLORS = {
  revenue: "text-green-600",
  expense: "text-destructive",
  transfer: "text-blue-600",
};

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function SavingsBoxCard({ box, onDelete }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: box.color || "#8b5cf6" }}>
        <PiggyBank className="w-3 h-3 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">{box.name}</p>
        <p className="text-[10px] text-muted-foreground">{box.cdi_rate || 100}% CDI</p>
      </div>
      <span className="text-xs font-bold flex-shrink-0" style={{ color: box.color || "#8b5cf6" }}>
        {fmtR(box.balance)}
      </span>
      {onDelete && (
        <button onClick={() => onDelete(box)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default function BankAccountsIndicator({ accounts, entries, savingsBoxes, onRefresh }) {
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [showCreateBox, setShowCreateBox] = useState(null); // account object
  const [showTransfer, setShowTransfer] = useState(null); // account object

  const accountData = useMemo(() => {
    return accounts.map(acc => {
      const accountEntries = entries.filter(e => {
        if (e.type === "transfer") {
          return e.bank_account_id === acc.id || e.notes?.split("|")[0] === acc.id;
        }
        return e.bank_account_id === acc.id;
      }).sort((a, b) => {
        const dateA = a.payment_date || a.due_date || a.created_date || "";
        const dateB = b.payment_date || b.due_date || b.created_date || "";
        return dateB.localeCompare(dateA);
      });

      const boxes = (savingsBoxes || []).filter(b => b.bank_account_id === acc.id && b.is_active !== false);
      const totalBoxes = boxes.reduce((s, b) => s + (b.balance || 0), 0);

      return {
        ...acc,
        transactions: accountEntries.slice(0, 10),
        boxes,
        totalBoxes,
        totalWithBoxes: (acc.balance || 0) + totalBoxes,
      };
    });
  }, [accounts, entries, savingsBoxes]);

  async function handleDeleteBox(box) {
    if (!window.confirm(`Excluir caixinha "${box.name}"? O saldo de ${fmtR(box.balance)} será devolvido à conta corrente.`)) return;
    const { base44 } = await import("@/api/base44Client");
    if (box.balance > 0) {
      const acc = accounts.find(a => a.id === box.bank_account_id);
      if (acc) await base44.entities.BankAccount.update(acc.id, { balance: (acc.balance || 0) + box.balance });
    }
    await base44.entities.SavingsBox.update(box.id, { is_active: false, balance: 0 });
    onRefresh?.();
  }

  return (
    <>
      <div className="glass-card mb-6 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
            <ArrowRightLeft className="w-3.5 h-3.5 text-white" />
          </div>
          <h2 className="text-sm font-bold text-foreground">Contas Bancárias</h2>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            Total: <span className="font-bold text-foreground">{fmtR(accountData.reduce((s, a) => s + a.totalWithBoxes, 0))}</span>
          </span>
        </div>

        <div className="p-4 space-y-3">
          {accountData.map(acc => {
            const isExpanded = expandedAccount === acc.id;
            return (
              <div key={acc.id} className="border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedAccount(isExpanded ? null : acc.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">{acc.name[0]?.toUpperCase()}</span>
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-xs font-semibold text-foreground">{acc.name}</p>
                      <p className="text-[10px] text-muted-foreground">{acc.bank_name || "Conta Bancária"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-sm font-bold ${(acc.balance || 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                        {fmtR(acc.balance)}
                      </p>
                      {acc.totalBoxes > 0 && (
                        <p className="text-[10px] text-purple-600 font-medium">
                          + {fmtR(acc.totalBoxes)} em caixinhas
                        </p>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Savings Boxes */}
                    {acc.boxes.length > 0 && (
                      <div className="border-b border-border">
                        <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20">
                          <PiggyBank className="w-3.5 h-3.5 text-purple-600" />
                          <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Caixinhas</span>
                          <div className="flex-1" />
                          <span className="text-xs font-bold text-purple-600">{fmtR(acc.totalBoxes)}</span>
                        </div>
                        <div className="divide-y divide-border">
                          {acc.boxes.map(box => (
                            <SavingsBoxCard key={box.id} box={box} onDelete={handleDeleteBox} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 px-4 py-2.5 bg-muted/20">
                      <button
                        onClick={() => setShowTransfer(acc)}
                        disabled={acc.boxes.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowLeftRight className="w-3 h-3" /> Transferir
                      </button>
                      <button
                        onClick={() => setShowCreateBox(acc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground hover:bg-muted/80 rounded-lg text-xs font-semibold transition-all"
                      >
                        <Plus className="w-3 h-3" /> Nova Caixinha
                      </button>
                    </div>

                    {/* Transactions */}
                    <div className="bg-muted/30 max-h-60 overflow-y-auto">
                      {acc.transactions.length === 0 ? (
                        <div className="p-4 text-center text-xs text-muted-foreground">
                          Nenhuma movimentação
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {acc.transactions.map((entry, idx) => {
                            const IconComp = TYPE_ICONS[entry.type];
                            const colorClass = TYPE_COLORS[entry.type];
                            const date = entry.payment_date || entry.due_date || entry.created_date;
                            return (
                              <div key={`${entry.id}-${idx}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                                <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${entry.type === "revenue" ? "bg-green-100" : entry.type === "expense" ? "bg-red-100" : "bg-blue-100"}`}>
                                  {IconComp && <IconComp className={`w-3 h-3 ${colorClass}`} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-foreground truncate">{entry.title}</p>
                                  {date && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {format(new Date(date), "dd/MM/yyyy", { locale: ptBR })}
                                    </p>
                                  )}
                                </div>
                                <span className={`text-xs font-bold flex-shrink-0 ${colorClass}`}>
                                  {entry.type === "expense" ? "-" : "+"} {fmtR(entry.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showCreateBox && (
        <SavingsBoxModal
          account={showCreateBox}
          onClose={() => setShowCreateBox(null)}
          onCreated={() => { setShowCreateBox(null); onRefresh?.(); }}
        />
      )}

      {showTransfer && (
        <SavingsTransferModal
          account={showTransfer}
          boxes={(savingsBoxes || []).filter(b => b.bank_account_id === showTransfer.id && b.is_active !== false)}
          onClose={() => setShowTransfer(null)}
          onTransfer={() => { setShowTransfer(null); onRefresh?.(); }}
        />
      )}
    </>
  );
}