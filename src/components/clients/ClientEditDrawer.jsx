import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Crown, Save, Plus, Edit2, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import NpsScoreBadge from "./NpsScoreBadge";
import InsightsTab from "./InsightsTab";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import StandardDrawer from "@/components/ui/StandardDrawer";

const TABS = [
  { id: "dados", label: "Cadastro" },
  { id: "nps", label: "NPS" },
  { id: "historico", label: "Histórico" },
  { id: "insights", label: "Insights" },
];

export default function ClientEditDrawer({ client, npsHistory = [], npsEntries = [], onClose, onSaved, initialTab = "dados" }) {
  const [tab, setTab] = useState(initialTab);

  // --- Dados form ---
  const [form, setForm] = useState({
    name: client.name || "",
    company_name: client.company_name || "",
    cnpj: client.cnpj || "",
    email: client.email || "",
    phone: client.phone || "",
    responsible: client.responsible || "",
    address: client.address || "",
    birthday: client.birthday || "",
    notes: client.notes || "",
    status: client.status || "active",
    tier: client.tier || "standard",
    instagram_account_id: client.instagram_account_id || "",
    instagram_username: client.instagram_username || "",
    monthly_deliveries: client.monthly_deliveries || "",
    contracted_cards: client.contracted_cards || 0,
    contracted_reels: client.contracted_reels || 0,
    contracted_promocoes: client.contracted_promocoes || 0,
    contracted_vt: client.contracted_vt || 0,
    contracted_foto: client.contracted_foto || 0,
    contracted_stories: client.contracted_stories || 0,
  });
  const [services, setServices] = useState(client.services || []);
  const [newService, setNewService] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await base44.entities.Client.update(client.id, {
      ...form,
      services,
      instagram_account_id: form.instagram_account_id || undefined,
      instagram_username: form.instagram_username || undefined,
      monthly_deliveries: form.monthly_deliveries !== "" ? Number(form.monthly_deliveries) : undefined,
      contracted_cards: Number(form.contracted_cards) || 0,
      contracted_reels: Number(form.contracted_reels) || 0,
      contracted_promocoes: Number(form.contracted_promocoes) || 0,
      contracted_vt: Number(form.contracted_vt) || 0,
      contracted_foto: Number(form.contracted_foto) || 0,
      contracted_stories: Number(form.contracted_stories) || 0,
    });
    setSaving(false);
    onSaved?.();
    onClose();
  }

  // --- NPS ---
  const currentMonth = format(new Date(), "yyyy-MM");
  const currentMonthEntry = npsEntries.find(e => e.client_id === client.id && e.month === currentMonth);
  const [npsMode, setNpsMode] = useState("monthly"); // "monthly" | "manual"
  const [monthlyScore, setMonthlyScore] = useState(currentMonthEntry?.monthly_score ?? 100);
  const [monthlyNotes, setMonthlyNotes] = useState(currentMonthEntry?.notes ?? "");
  const [editScore, setEditScore] = useState(client.nps_score ?? 100);
  const [justification, setJustification] = useState("");
  const [npsSaving, setNpsSaving] = useState(false);

  async function saveMonthlyEntry() {
    setNpsSaving(true);
    const scoreBefore = client.nps_score ?? 100;
    const newGeneral = Math.round((scoreBefore * 0.7 + monthlyScore * 0.3));
    if (currentMonthEntry) {
      await base44.entities.NpsEntry.update(currentMonthEntry.id, { monthly_score: monthlyScore, notes: monthlyNotes });
    } else {
      await base44.entities.NpsEntry.create({
        client_id: client.id, client_name: client.name,
        month: currentMonth, monthly_score: monthlyScore, notes: monthlyNotes,
        recorded_by: "manual",
      });
    }
    await base44.entities.NpsHistory.create({
      client_id: client.id, client_name: client.name,
      event_type: "monthly_entry", delta: newGeneral - scoreBefore,
      score_before: scoreBefore, score_after: newGeneral,
      description: `Nota mensal ${currentMonth}: ${monthlyScore}`,
      justification: monthlyNotes,
    });
    await base44.entities.Client.update(client.id, { nps_score: newGeneral });
    setNpsSaving(false);
    onSaved?.();
    onClose();
  }

  async function saveManualScore() {
    if (!justification.trim()) return;
    setNpsSaving(true);
    const scoreBefore = client.nps_score ?? 100;
    await base44.entities.NpsHistory.create({
      client_id: client.id, client_name: client.name,
      event_type: "manual_change", delta: editScore - scoreBefore,
      score_before: scoreBefore, score_after: editScore,
      description: `Nota alterada manualmente para ${editScore}`,
      justification,
    });
    await base44.entities.Client.update(client.id, { nps_score: editScore, nps_justification: justification, nps_manual_override: true });
    setNpsSaving(false);
    onSaved?.();
    onClose();
  }

  // --- Histórico ---
  const clientHistory = (npsHistory || [])
    .filter(h => h.client_id === client.id)
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .slice(0, 20);

  const drawerTitle = (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white text-xs font-bold no-touch-min">
        {client.name[0]?.toUpperCase()}
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-foreground leading-tight">{client.name}</span>
          {client.tier === "elite" && <Crown className="w-3.5 h-3.5 text-amber-500" />}
        </div>
        <p className="text-[10px] text-muted-foreground no-touch-min">NPS: {client.nps_score ?? 100}</p>
      </div>
    </div>
  );

  const drawerFooter = tab === "dados" ? (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1 h-9 text-sm" onClick={onClose}>Cancelar</Button>
      <Button className="flex-1 h-9 text-sm" onClick={handleSave} disabled={saving}>
        <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  ) : null;

  return (
    <StandardDrawer open={true} onClose={onClose} title={drawerTitle} width={400} footer={drawerFooter}>
        {/* Tabs */}
        <div className="flex border-b border-border">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                tab === t.id
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* === DADOS === */}
          {tab === "dados" && (
            <div className="space-y-3">
              {/* Tier toggle */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Tier</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setForm(f => ({ ...f, tier: "standard" }))}
                    className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                      form.tier === "standard" ? "bg-muted border-border text-foreground" : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >Padrão</button>
                  <button
                    onClick={() => setForm(f => ({ ...f, tier: "elite" }))}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                      form.tier === "elite" ? "bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  ><Crown className="w-3 h-3" /> Elite</button>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-lg border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>

              {[
                { key: "name", label: "Nome fantasia" },
                { key: "company_name", label: "Razão social" },
                { key: "cnpj", label: "CNPJ" },
                { key: "email", label: "E-mail" },
                { key: "phone", label: "Telefone" },
                { key: "responsible", label: "Responsável comercial" },
                { key: "address", label: "Endereço" },
                { key: "birthday", label: "Data de aniversário", type: "date" },
                { key: "monthly_deliveries", label: "Entregas mensais contratadas", type: "number" },
                { key: "instagram_username", label: "Instagram (@usuário)" },
                { key: "instagram_account_id", label: "Instagram Account ID (Meta API)" },
              ].map(({ key, label, type }) => (
                <div key={key}>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">{label}</label>
                  <input
                    type={type || "text"}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}

              {/* Postagens contratadas por formato */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Postagens contratadas por formato</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "contracted_cards", label: "Cards", color: "#4ade80" },
                    { key: "contracted_reels", label: "Reels", color: "#60a5fa" },
                    { key: "contracted_promocoes", label: "Promoções", color: "#f87171" },
                    { key: "contracted_foto", label: "Foto", color: "#fbbf24" },
                    { key: "contracted_vt", label: "VT", color: "#fb923c" },
                    { key: "contracted_stories", label: "Stories", color: "#a78bfa" },
                  ].map(f => (
                    <div key={f.key} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                      <span className="text-[10px] font-semibold text-muted-foreground w-16">{f.label}</span>
                      <input
                        type="number"
                        min={0}
                        value={form[f.key]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="h-7 w-14 rounded-md border border-input bg-background px-2 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Serviços Prestados */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Serviços Prestados</label>
                <div className="space-y-1.5">
                  {services.map((svc, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
                      <span className="flex-1 text-xs text-foreground">{svc}</span>
                      <button
                        type="button"
                        onClick={() => setServices(prev => prev.filter((_, idx) => idx !== i))}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {services.length === 0 && (
                    <p className="text-[10px] text-muted-foreground py-1">Nenhum serviço adicionado</p>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Novo serviço..."
                    value={newService}
                    onChange={e => setNewService(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newService.trim()) {
                        e.preventDefault();
                        setServices(prev => [...prev, newService.trim()]);
                        setNewService("");
                      }
                    }}
                    className="flex-1 h-8 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2.5"
                    disabled={!newService.trim()}
                    onClick={() => {
                      if (newService.trim()) {
                        setServices(prev => [...prev, newService.trim()]);
                        setNewService("");
                      }
                    }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Notas internas</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
            </div>
          )}

          {/* === NPS === */}
          {tab === "nps" && (
            <div className="space-y-4">
              {/* Mode selector */}
              <div className="flex gap-2">
                <button
                  onClick={() => setNpsMode("monthly")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    npsMode === "monthly" ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Plus className="w-3 h-3" /> Nota do mês
                </button>
                <button
                  onClick={() => setNpsMode("manual")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                    npsMode === "manual" ? "bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Edit2 className="w-3 h-3" /> Editar nota
                </button>
              </div>

              {/* Monthly entry */}
              {npsMode === "monthly" && (
                <div className="space-y-3 bg-primary/5 rounded-xl p-4">
                  <p className="text-xs font-bold text-foreground">
                    Nota do mês — {format(new Date(), "MMMM yyyy", { locale: ptBR })}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Nota (0-100):</span>
                    <input
                      type="number" min={0} max={100}
                      value={monthlyScore}
                      onChange={e => setMonthlyScore(Number(e.target.value))}
                      className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <NpsScoreBadge score={monthlyScore} size="sm" />
                  </div>
                  <textarea
                    placeholder="Observações do mês..."
                    className="w-full h-20 rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    value={monthlyNotes}
                    onChange={e => setMonthlyNotes(e.target.value)}
                  />
                  <p className="text-[10px] text-muted-foreground">A nota geral será recalculada: 70% nota atual + 30% nota mensal</p>
                  <Button size="sm" onClick={saveMonthlyEntry} disabled={npsSaving} className="w-full h-8 text-xs">
                    {npsSaving ? "Salvando..." : "Salvar nota do mês"}
                  </Button>
                </div>
              )}

              {/* Manual override */}
              {npsMode === "manual" && (
                <div className="space-y-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-4">
                  <p className="text-xs font-bold text-foreground">Alterar nota geral (requer justificativa)</p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Nova nota:</span>
                    <input
                      type="number" min={0} max={100}
                      value={editScore}
                      onChange={e => setEditScore(Number(e.target.value))}
                      className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <NpsScoreBadge score={editScore} size="sm" />
                  </div>
                  <textarea
                    placeholder="Justificativa obrigatória..."
                    className="w-full h-20 rounded-lg border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    value={justification}
                    onChange={e => setJustification(e.target.value)}
                  />
                  <Button size="sm" onClick={saveManualScore} disabled={npsSaving || !justification.trim()} className="w-full h-8 text-xs">
                    {npsSaving ? "Salvando..." : "Confirmar alteração"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* === INSIGHTS === */}
          {tab === "insights" && (
            <InsightsTab client={client} />
          )}

          {/* === HISTÓRICO === */}
          {tab === "historico" && (
            <div>
              {clientHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Nenhum registro de NPS</p>
              ) : (
                <div className="space-y-2">
                  {clientHistory.map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs bg-muted/40 rounded-lg px-3 py-2.5">
                      <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${h.delta < 0 ? "bg-red-500" : h.delta > 0 ? "bg-green-500" : "bg-muted-foreground"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-medium leading-tight">{h.description}</p>
                        {h.justification && <p className="text-muted-foreground text-[10px] mt-0.5">"{h.justification}"</p>}
                        <p className="text-muted-foreground text-[10px] mt-0.5">
                          {h.score_before} → {h.score_after} · {h.created_date ? format(new Date(h.created_date), "dd/MM/yy HH:mm") : ""}
                        </p>
                      </div>
                      <span className={`text-xs font-bold flex-shrink-0 ${h.delta < 0 ? "text-red-600" : "text-green-600"}`}>
                        {h.delta > 0 ? "+" : ""}{h.delta}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
    </StandardDrawer>
  );
}