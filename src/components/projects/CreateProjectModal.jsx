import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StandardDrawer from "@/components/ui/StandardDrawer";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const MONTH_OPTIONS = (() => {
  const now = new Date();
  const options = [];
  for (let i = -2; i <= 12; i++) {
    const d = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i);
    const value = format(d, "yyyy-MM");
    const label = format(d, "MMMM yyyy", { locale: ptBR });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
})();

export default function CreateProjectModal({ onClose, onCreate, isAdmin }) {
  const [clients, setClients] = useState([]);
  const [availableTeams, setAvailableTeams] = useState([]);
  const [form, setForm] = useState({
    name: "",
    client_id: "",
    client_name: "",
    team: "",
    reference_month: format(new Date(), "yyyy-MM"),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Client.list("name", 100),
      base44.entities.Squad.filter({ is_active: true }, "name", 100),
    ]).then(([c, squads]) => {
      setClients(c.filter(cl => cl.status !== "inactive"));
      setAvailableTeams(squads.map(s => s.name).sort());
    });
  }, []);

  function handleClientChange(clientId) {
    const client = clients.find(c => c.id === clientId);
    setForm(f => ({ ...f, client_id: clientId, client_name: client?.name || "" }));
  }

  // Nome é obrigatório apenas se não tiver cliente + mês selecionados
  const hasClientAndMonth = form.client_id && form.reference_month;
  const nameRequired = !hasClientAndMonth;

  function buildAutoName() {
    if (!form.reference_month) return "";
    const monthLabel = MONTH_OPTIONS.find(m => m.value === form.reference_month)?.label || form.reference_month;
    return `${form.client_name} - ${monthLabel}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const finalName = form.name.trim() || buildAutoName();
    if (!finalName || !form.client_id) return;
    setSaving(true);
    const created = await base44.entities.Project.create({
      name: finalName,
      client_id: form.client_id,
      client_name: form.client_name,
      team: form.team,
      teams: form.team ? [form.team] : [],
      reference_month: form.reference_month || undefined,
      status: "no_status",
    });
    onCreate(created);
  }

  const drawerFooter = (
    <div className="flex gap-3">
      <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
      <Button type="submit" form="create-project-form" disabled={saving} className="flex-1">
        {saving ? "Criando..." : "Criar Projeto"}
      </Button>
    </div>
  );

  return (
    <StandardDrawer open={true} onClose={onClose} title="Novo Projeto" width={520} footer={drawerFooter}>
        <form id="create-project-form" onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Cliente */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Cliente *</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={form.client_id}
              onChange={e => handleClientChange(e.target.value)}
              required
            >
              <option value="">Selecione um cliente...</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Mês de Referência */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Mês de Referência *</label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={form.reference_month}
              onChange={e => setForm(f => ({ ...f, reference_month: e.target.value }))}
            >
              {MONTH_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">Define o mês do cronograma e dos jobs</p>
          </div>

          {/* Nome do Projeto (opcional se tiver cliente + mês) */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Nome do Projeto {nameRequired && "*"}
            </label>
            <Input
              placeholder={hasClientAndMonth ? `Auto: ${buildAutoName()}` : "Ex: Campanha Verão 2026"}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required={nameRequired}
            />
            {hasClientAndMonth && !form.name.trim() && (
              <p className="text-[10px] text-muted-foreground mt-1">Se vazio, será gerado automaticamente: <span className="font-semibold">{buildAutoName()}</span></p>
            )}
          </div>

          {/* Equipe */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Equipe</label>
            {availableTeams.length > 0 ? (
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.team}
                onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
              >
                <option value="">Selecione uma equipe...</option>
                {availableTeams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            ) : (
              <Input placeholder="Ex: Social Media, Performance..." value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} />
            )}
            <p className="text-[10px] text-muted-foreground mt-1">Define qual equipe gerará os jobs a partir dos templates</p>
          </div>

        </form>
    </StandardDrawer>
  );
}