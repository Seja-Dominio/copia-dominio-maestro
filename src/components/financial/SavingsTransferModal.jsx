import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ArrowRight } from "lucide-react";

export default function SavingsTransferModal({ account, boxes, onClose, onTransfer }) {
  const [direction, setDirection] = useState("deposit"); // deposit = CC→caixinha, withdraw = caixinha→CC
  const [selectedBoxId, setSelectedBoxId] = useState(boxes[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedBox = boxes.find(b => b.id === selectedBoxId);

  async function handleSubmit(e) {
    e.preventDefault();
    const val = Number(amount);
    if (!val || val <= 0 || !selectedBoxId) return;
    setSaving(true);

    // Create transaction record
    await base44.entities.SavingsTransaction.create({
      savings_box_id: selectedBoxId,
      savings_box_name: selectedBox?.name || "",
      bank_account_id: account.id,
      bank_account_name: account.name,
      type: direction,
      amount: val,
      notes,
    });

    // Update balances
    if (direction === "deposit") {
      // CC → Caixinha: diminui CC, aumenta caixinha
      await base44.entities.BankAccount.update(account.id, { balance: (account.balance || 0) - val });
      await base44.entities.SavingsBox.update(selectedBoxId, { balance: (selectedBox?.balance || 0) + val });
    } else {
      // Caixinha → CC: aumenta CC, diminui caixinha
      await base44.entities.BankAccount.update(account.id, { balance: (account.balance || 0) + val });
      await base44.entities.SavingsBox.update(selectedBoxId, { balance: (selectedBox?.balance || 0) - val });
    }

    onTransfer();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Transferir — {account.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Direction */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Direção</label>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => setDirection("deposit")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  direction === "deposit" ? "bg-purple-100 text-purple-700 border-purple-300" : "bg-muted text-muted-foreground border-transparent"
                }`}
              >
                CC <ArrowRight className="w-3 h-3" /> Caixinha
              </button>
              <button type="button"
                onClick={() => setDirection("withdraw")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  direction === "withdraw" ? "bg-green-100 text-green-700 border-green-300" : "bg-muted text-muted-foreground border-transparent"
                }`}
              >
                Caixinha <ArrowRight className="w-3 h-3" /> CC
              </button>
            </div>
          </div>

          {/* Box selector */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Caixinha</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedBoxId}
              onChange={e => setSelectedBoxId(e.target.value)}
            >
              {boxes.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} — R$ {(b.balance || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </div>

          {/* Info */}
          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Saldo CC</span>
              <span className="font-bold text-foreground">R$ {(account.balance || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
            </div>
            {selectedBox && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Saldo {selectedBox.name}</span>
                <span className="font-bold" style={{ color: selectedBox.color || "#8b5cf6" }}>
                  R$ {(selectedBox.balance || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Valor (R$)</label>
            <Input type="number" step="0.01" min="0.01" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Observação</label>
            <Input placeholder="Opcional..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Transferindo..." : direction === "deposit" ? "Enviar para Caixinha" : "Resgatar da Caixinha"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}