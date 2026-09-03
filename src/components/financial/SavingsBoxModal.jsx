import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

const BOX_COLORS = ["#8b5cf6", "#3b82f6", "#06b6d4", "#22c55e", "#f59e0b", "#ec4899", "#ef4444"];

export default function SavingsBoxModal({ account, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(BOX_COLORS[0]);
  const [cdiRate, setCdiRate] = useState(100);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const box = await base44.entities.SavingsBox.create({
      bank_account_id: account.id,
      bank_account_name: account.name,
      name: name.trim(),
      balance: 0,
      cdi_rate: cdiRate,
      color,
      is_active: true,
    });
    onCreated(box);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Nova Caixinha — {account.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome da Caixinha *</label>
            <Input placeholder="Ex: Reserva de emergência" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Rendimento (% CDI)</label>
            <Input type="number" step="0.1" min={0} max={200} value={cdiRate} onChange={e => setCdiRate(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Cor</label>
            <div className="flex gap-2">
              {BOX_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={saving} className="flex-1">{saving ? "Criando..." : "Criar Caixinha"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}