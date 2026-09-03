import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check } from "lucide-react";
import { fetchRolesList } from "@/components/settings/RolesConfig";
import COLLABORATOR_COLORS from "@/lib/collaboratorColors";
import StandardDrawer from "@/components/ui/StandardDrawer";

export default function CollaboratorFormModal({ collaborator, onClose, onSave }) {
  const [form, setForm] = useState({
    name: collaborator?.name || "",
    email: collaborator?.email || "",
    role: collaborator?.role || "",
    department: collaborator?.department || "",
    phone: collaborator?.phone || "",
    birthday: collaborator?.birthday || "",
    hourly_rate: collaborator?.hourly_rate || "",
    monthly_salary: collaborator?.monthly_salary || "",
    contract_end_date: collaborator?.contract_end_date || "",
    color: collaborator?.color || "",
    is_active: collaborator?.is_active !== undefined ? collaborator.is_active : true,
  });
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);

  useEffect(() => {
    fetchRolesList().then(setRoleOptions);
  }, []);

  const set = key => e => {
    const value = e.target.value;
    setForm(f => {
      const updated = { ...f, [key]: value };
      // Auto-calcular valor/hora = salário / 200
      if (key === "monthly_salary" && value) {
        updated.hourly_rate = (Number(value) / 200).toFixed(2);
      }
      return updated;
    });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const data = {
      ...form,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : undefined,
      monthly_salary: form.monthly_salary ? Number(form.monthly_salary) : undefined,
    };
    let result;
    if (collaborator?.id) {
      result = await base44.entities.Collaborator.update(collaborator.id, data);
    } else {
      result = await base44.entities.Collaborator.create(data);
    }
    onSave(result);
  }

  const drawerFooter = (
    <div className="flex gap-3">
      <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
      <Button type="submit" form="collab-form" disabled={saving} className="flex-1">
        {saving ? "Salvando..." : collaborator ? "Salvar" : "Criar"}
      </Button>
    </div>
  );

  return (
    <StandardDrawer open={true} onClose={onClose} title={collaborator ? "Editar Colaborador" : "Novo Colaborador"} width={520} footer={drawerFooter}>
        <form id="collab-form" onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome *</label>
            <Input placeholder="Nome completo" value={form.name} onChange={set("name")} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">E-mail *</label>
              <Input type="email" placeholder="email@agencia.com" value={form.email} onChange={set("email")} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Telefone</label>
              <Input placeholder="(11) 99999-0000" value={form.phone} onChange={set("phone")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Função</label>
              <select
                className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.role}
                onChange={set("role")}
              >
                <option value="">Selecione...</option>
                {roleOptions.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Departamento</label>
              <Input placeholder="Ex: Criação" value={form.department} onChange={set("department")} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data de Aniversário</label>
            <Input type="date" value={form.birthday} onChange={set("birthday")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Salário Mensal (R$)</label>
              <Input type="number" placeholder="0,00" value={form.monthly_salary} onChange={set("monthly_salary")} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Valor/hora (R$) <span className="text-[10px] font-normal text-primary">(auto: salário ÷ 200)</span></label>
              <Input type="number" placeholder="0,00" value={form.hourly_rate} onChange={set("hourly_rate")} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Cor de Identificação</label>
            <div className="flex flex-wrap gap-2">
              {COLLABORATOR_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110 no-touch-min"
                  style={{ backgroundColor: c, borderColor: form.color === c ? "#000" : "transparent" }}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                >
                  {form.color === c && <Check className="w-3.5 h-3.5 text-white drop-shadow-md" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Prazo Final do Contrato</label>
            <Input type="date" value={form.contract_end_date} onChange={set("contract_end_date")} />
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-input accent-primary"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-foreground cursor-pointer">Colaborador ativo</label>
          </div>

        </form>
    </StandardDrawer>
  );
}