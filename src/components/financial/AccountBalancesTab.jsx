import { useState, useMemo } from "react";
import { PiggyBank, Plus, ArrowLeftRight, ChevronDown, Trash2, Wallet } from "lucide-react";
import SavingsBoxModal from "./SavingsBoxModal";
import SavingsTransferModal from "./SavingsTransferModal";
import { base44 } from "@/api/base44Client";

function fmtR(val) {
  return `R$ ${(val || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export default function AccountBalancesTab({ accounts, savingsBoxes, onRefresh }) {
  const [expandedAccount, setExpandedAccount] = useState(null);
  const [showCreateBox, setShowCreateBox] = useState(null);
  const [showTransfer, setShowTransfer] = useState(null);

  const accountData = useMemo(() => {
    return accounts.map(acc => {
      const boxes = (savingsBoxes || []).filter(b => b.bank_account_id === acc.id && b.is_active !== false);
      const totalBoxes = boxes.reduce((s, b) => s + (b.balance || 0), 0);
      return { ...acc, boxes, totalBoxes, totalWithBoxes: (acc.balance || 0) + totalBoxes };
    });
  }, [accounts, savingsBoxes]);

  const grandTotal = accountData.reduce((s, a) => s + a.totalWithBoxes, 0);

  async function handleDeleteBox(box) {
    if (!window.confirm(`Excluir caixinha "${box.name}"? O saldo de ${fmtR(box.balance)} será devolvido à conta corrente.`)) return;
    if (box.balance > 0) {
      const acc = accounts.find(a => a.id === box.bank_account_id);
      if (acc) await base44.entities.BankAccount.update(acc.id, { balance: (acc.balance || 0) + box.balance });
    }
    await base44.entities.SavingsBox.update(box.id, { is_active: false, balance: 0 });
    onRefresh?.();
  }

  return (
    <>
      {/* Grand total card */}
      <div className="glass-card p-5 mb-5 border-primary/30 bg-primary/5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Saldo Total Consolidado</p>
            <p className={`text-2xl font-black ${grandTotal >= 0 ? "text-primary" : "text-destructive"}`}>
              {fmtR(grandTotal)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs">
            <span className="text-muted-foreground">{accountData.length} conta{accountData.length !== 1 ? "s" : ""}</span>
            <span className="text-purple-600 font-medium">
              {accountData.reduce((s, a) => s + a.boxes.length, 0)} caixinha{accountData.reduce((s, a) => s + a.boxes.length, 0) !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Account cards */}
      <div className="grid gap-4">
        {accountData.map(acc => {
          const isExpanded = expandedAccount === acc.id;
          return (
            <div key={acc.id} className="glass-card overflow-hidden">
              {/* Account header */}
              <button
                onClick={() => setExpandedAccount(isExpanded ? null : acc.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-foreground">{acc.name}</p>
                    <p className="text-xs text-muted-foreground">{acc.bank_name || "Conta Bancária"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-0.5">Saldo CC</p>
                    <p className={`text-base font-bold ${(acc.balance || 0) >= 0 ? "text-green-600" : "text-destructive"}`}>
                      {fmtR(acc.balance)}
                    </p>
                  </div>
                  {acc.totalBoxes > 0 && (
                    <div className="text-right border-l border-border pl-3">
                      <p className="text-xs text-muted-foreground mb-0.5">Total c/ caixinhas</p>
                      <p className="text-base font-bold text-primary">{fmtR(acc.totalWithBoxes)}</p>
                    </div>
                  )}
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </button>

              {/* Expanded area: savings boxes */}
              {isExpanded && (
                <div className="border-t border-border">
                  {/* Savings Boxes */}
                  {acc.boxes.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 px-5 py-2.5 bg-purple-50 dark:bg-purple-900/20">
                        <PiggyBank className="w-3.5 h-3.5 text-purple-600" />
                        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wide">Caixinhas</span>
                        <div className="flex-1" />
                        <span className="text-xs font-bold text-purple-600">{fmtR(acc.totalBoxes)}</span>
                      </div>
                      <div className="divide-y divide-border">
                        {acc.boxes.map(box => (
                          <div key={box.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: box.color || "#8b5cf6" }}>
                              <PiggyBank className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground">{box.name}</p>
                              <p className="text-[10px] text-muted-foreground">{box.cdi_rate || 100}% CDI</p>
                            </div>
                            <span className="text-sm font-bold flex-shrink-0" style={{ color: box.color || "#8b5cf6" }}>
                              {fmtR(box.balance)}
                            </span>
                            <button onClick={() => handleDeleteBox(box)} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 px-5 py-3 bg-muted/20 border-t border-border">
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
                </div>
              )}
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div className="glass-card p-8 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma conta bancária cadastrada</p>
          </div>
        )}
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