import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Save, Plus, Trash2, Loader2, FileText, ChevronRight, CalendarIcon, ChevronDown } from "lucide-react";
import StandardDrawer from "@/components/ui/StandardDrawer";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ptBR } from "date-fns/locale";
import GenerateProposalModal from "./GenerateProposalModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

const EMPTY_ITEM = { description: "", quantity: 1, unit_price: 0, total: 0 };

const PROPOSAL_TYPES = [
  { value: "contrato_mensal", label: "Contrato Mensal" },
  { value: "job_pontual", label: "Job Pontual" },
];

export default function ProposalFormModal({ proposal, onClose, onSaved }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showGenerateDoc, setShowGenerateDoc] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [form, setForm] = useState({
    title: proposal?.title || "",
    client_id: proposal?.client_id || "",
    client_name: proposal?.client_name || "",
    status: proposal?.status || "sent",
    proposal_type: proposal?.proposal_type || "job_pontual",
    valid_until: proposal?.valid_until || "",
    notes: proposal?.notes || "",
    items: proposal?.items?.length ? proposal.items : [{ ...EMPTY_ITEM }],
  });

  useEffect(() => {
    base44.entities.Client.list("name", 200).then(c => {
      setClients(c);
      setLoading(false);
    });
  }, []);

  function setClient(id) {
    const c = clients.find(x => x.id === id);
    setForm(f => ({ ...f, client_id: id, client_name: c?.name || "" }));
  }

  function updateItem(idx, field, value) {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === "quantity" || field === "unit_price") {
        items[idx].total = (items[idx].quantity || 0) * (items[idx].unit_price || 0);
      }
      return { ...f, items };
    });
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  }

  function removeItem(idx) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  const totalAmount = form.items.reduce((s, it) => s + (it.total || 0), 0);

  async function handleSave() {
    if (!form.title || (!form.client_id && !form.client_name)) return;
    setSaving(true);
    const data = {
      ...form,
      total_amount: totalAmount,
      items: form.items.filter(it => it.description),
    };
    if (!data.number && !proposal) {
      // auto-number
      const all = await base44.entities.Proposal.list("-number", 1);
      data.number = (all[0]?.number || 0) + 1;
    }
    if (proposal) {
      await base44.entities.Proposal.update(proposal.id, data);
    } else {
      await base44.entities.Proposal.create(data);
    }
    setSaving(false);
    onSaved();
  }

  const drawerFooter = (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1 h-9 text-sm" onClick={onClose}>Cancelar</Button>
      <Button className="flex-1 h-9 text-sm" onClick={handleSave} disabled={saving || !form.title || (!form.client_id && !form.client_name)}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar"}
      </Button>
      <Button variant="outline" className="flex-1 h-9 text-sm gap-1 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setShowGenerateDoc(true)}>
        <FileText className="w-4 h-4" /> PDF
      </Button>
    </div>
  );

  const modal = (
    <StandardDrawer open={true} onClose={onClose} title={proposal ? "Editar Proposta" : "Nova Proposta"} footer={drawerFooter}>
        <div className="px-5 py-4" style={{ display: "flex", flexDirection: "column", gap: "26px" }}>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block no-touch-min" style={{ marginBottom: "6px" }}>Título *</label>
            <Input
              autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Proposta Social Media — Cliente X"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block no-touch-min" style={{ marginBottom: "6px" }}>Tipo de Proposta</label>
              <select
                value={form.proposal_type}
                onChange={e => setForm(f => ({ ...f, proposal_type: e.target.value }))}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {PROPOSAL_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block no-touch-min" style={{ marginBottom: "6px" }}>Validade</label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-start text-left font-normal text-sm">
                    <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                    {form.valid_until ? format(new Date(form.valid_until + "T12:00:00"), "dd/MM/yyyy") : <span className="text-muted-foreground">Selecione a data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[200]" align="start">
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    selected={form.valid_until ? new Date(form.valid_until + "T12:00:00") : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, "0");
                        const d = String(date.getDate()).padStart(2, "0");
                        setForm(f => ({ ...f, valid_until: `${y}-${m}-${d}` }));
                      }
                      setCalendarOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <div className="relative">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block no-touch-min" style={{ marginBottom: "6px" }}>Cliente *</label>
              <Input
                value={form.client_name}
                onChange={e => {
                  setForm(f => ({ ...f, client_name: e.target.value, client_id: "" }));
                  setShowClientDropdown(true);
                }}
                onFocus={() => setShowClientDropdown(true)}
                onBlur={(e) => {
                  setTimeout(() => setShowClientDropdown(false), 200);
                }}
                placeholder="Digite ou selecione um cliente"
                autoComplete="off"
              />
              {showClientDropdown && (() => {
                const search = (form.client_name || "").toLowerCase();
                const filtered = clients.filter(c => c.name.toLowerCase().includes(search));
                return (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg">
                    {filtered.length > 0 ? filtered.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => {
                          setForm(f => ({ ...f, client_id: c.id, client_name: c.name }));
                          setShowClientDropdown(false);
                        }}
                      >
                        {c.name}
                      </button>
                    )) : (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado</div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block no-touch-min" style={{ marginBottom: "6px" }}>Itens / Serviços</label>
            {/* New item input row */}
            <div className="flex gap-2 items-start mb-3">
              <div className="flex-1">
                <Input
                  placeholder="Descrição do serviço/produto"
                  value={form.newItemDesc || ""}
                  onChange={e => setForm(f => ({ ...f, newItemDesc: e.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="w-16">
                <Input
                  inputMode="decimal"
                  placeholder="Qtd"
                  value={form.newItemQty || ""}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                    if (v === "" || /^\d+\.?\d{0,2}$/.test(v)) setForm(f => ({ ...f, newItemQty: v }));
                  }}
                  className="h-8 text-sm text-center"
                />
              </div>
              <div className="w-28">
                <Input
                  inputMode="decimal"
                  placeholder="R$ Unit."
                  value={form.newItemPrice || ""}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                    if (v === "" || /^\d+\.?\d{0,2}$/.test(v)) setForm(f => ({ ...f, newItemPrice: v }));
                  }}
                  className="h-8 text-sm"
                />
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1 flex-shrink-0" onClick={() => {
                const qty = Number(form.newItemQty) || 1;
                const price = Number(form.newItemPrice) || 0;
                if (!form.newItemDesc) return;
                setForm(f => ({
                  ...f,
                  items: [...f.items.filter(it => it.description), { description: f.newItemDesc, quantity: qty, unit_price: price, total: qty * price }],
                  newItemDesc: "", newItemQty: "", newItemPrice: "",
                }));
              }}>
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </div>
            {/* Existing items */}
            <div className="space-y-2">
              {form.items.filter(it => it.description).map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center bg-muted/30 rounded-lg p-2">
                  <div className="flex-1 text-sm font-medium truncate">{item.description}</div>
                  <div className="w-12 text-center text-sm text-muted-foreground">{item.quantity}x</div>
                  <div className="w-24 text-right">
                    <span className="text-sm font-semibold text-foreground">
                      R$ {(item.total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <button
                    onClick={() => removeItem(idx)}
                    className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-destructive/60 hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2 pr-10">
              <span className="text-sm font-bold text-foreground">
                Total: R$ {totalAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide block no-touch-min" style={{ marginBottom: "6px" }}>Observações</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Condições especiais, prazos, observações..."
              className="w-full h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>


        </div>
    </StandardDrawer>
  );

  return (
    <>
      {modal}
      {showGenerateDoc && (
        <GenerateProposalModal onClose={() => setShowGenerateDoc(false)} />
      )}
    </>
  );
}