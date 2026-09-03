import { useState, useEffect } from "react";
import StandardDrawer from "@/components/ui/StandardDrawer";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { format, addDays, addWeeks, addMonths, addYears } from "date-fns";

const STATUSES = [
  { value: "forecast", label: "Previsão" },
  { value: "pending", label: "A realizar" },
  { value: "paid", label: "Realizado" },
  { value: "cancelled", label: "Cancelado" },
];

const REVENUE_CATEGORIES = [
  { value: "fee", label: "FEE / Mensalidade" },
  { value: "production", label: "Produção" },
  { value: "media", label: "Mídia" },
  { value: "other", label: "Outros" },
];

const EXPENSE_CATEGORIES = [
  { value: "salary", label: "Salário / Pessoal" },
  { value: "supplier", label: "Fornecedor" },
  { value: "tax", label: "Imposto" },
  { value: "tools", label: "Ferramentas / Software" },
  { value: "rent", label: "Aluguel / Infraestrutura" },
  { value: "production", label: "Produção" },
  { value: "media", label: "Mídia" },
  { value: "other", label: "Outros" },
];

const RECURRING_INTERVALS = [
  { value: "monthly", label: "Mensal" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quinzenal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];

function advanceDate(date, interval) {
  switch (interval) {
    case "weekly": return addWeeks(date, 1);
    case "biweekly": return addWeeks(date, 2);
    case "monthly": return addMonths(date, 1);
    case "quarterly": return addMonths(date, 3);
    case "semiannual": return addMonths(date, 6);
    case "annual": return addYears(date, 1);
    default: return addMonths(date, 1);
  }
}

function SectionLabel({ children }) {
  return <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2 mb-1.5 border-b border-border pb-1">{children}</p>;
}

function FieldLabel({ children, required }) {
  return (
    <label className="text-xs font-semibold text-muted-foreground mb-1 block">
      {children}{required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

function SelectField({ value, onChange, options, placeholder }) {
  return (
    <select
      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">{placeholder || "Selecionar"}</option>
      {options.map(o => <option key={o.value || o.id} value={o.value || o.id}>{o.label || o.name}</option>)}
    </select>
  );
}

export default function CreateEntryModal({ type: initialType, entry: editingEntry, onClose, onCreate }) {
  const [clients, setClients] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [form, setForm] = useState({
    type: editingEntry?.type || initialType || "revenue",
    title: editingEntry?.title || "",
    amount: editingEntry?.amount || "",
    due_date: editingEntry?.due_date || "",
    competence_date: editingEntry?.competence_date || "",
    payment_date: editingEntry?.payment_date || "",
    status: editingEntry?.status || "pending",
    category: editingEntry?.category || "",
    subcategory_id: editingEntry?.subcategory_id || "",
    subcategory_name: editingEntry?.subcategory_name || "",
    expense_type: editingEntry?.expense_type || "",
    client_id: editingEntry?.client_id || "",
    client_name: editingEntry?.client_name || "",
    bank_account_id: editingEntry?.bank_account_id || "",
    bank_account_name: editingEntry?.bank_account_name || "",
    cost_center: editingEntry?.cost_center || "",
    document_number: editingEntry?.document_number || "",
    has_invoice: editingEntry?.has_invoice || false,
    notes: editingEntry?.notes || "",
    dest_bank_account_id: "",
  });

  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringInterval, setRecurringInterval] = useState("monthly");
  const [recurringCount, setRecurringCount] = useState(12);
  const [isInstallment, setIsInstallment] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Client.list("name", 200),
      base44.entities.BankAccount.list(),
      base44.entities.CostCenter.filter({ is_active: true }, "name", 100),
      base44.entities.FinancialCategory.filter({ is_active: true }, "order", 200),
    ]).then(([c, a, cc, sc]) => {
      setClients(c);
      setAccounts(a);
      setCostCenters(cc);
      setSubcategories(sc);
    });
  }, []);

  // Show advanced if editing and any advanced field has data
  useEffect(() => {
    if (editingEntry && (editingEntry.competence_date || editingEntry.cost_center || editingEntry.document_number || editingEntry.has_invoice)) {
      setShowAdvanced(true);
    }
  }, [editingEntry]);

  const set = key => val => setForm(f => ({ ...f, [key]: typeof val === "object" && val?.target ? val.target.value : val }));

  function handleClientChange(clientId) {
    const client = clients.find(c => c.id === clientId);
    setForm(f => ({ ...f, client_id: clientId, client_name: client?.name || "" }));
  }

  function handleAccountChange(accountId) {
    const account = accounts.find(a => a.id === accountId);
    setForm(f => ({ ...f, bank_account_id: accountId, bank_account_name: account?.name || "" }));
  }

  const categories = form.type === "revenue" ? REVENUE_CATEGORIES : form.type === "expense" ? EXPENSE_CATEGORIES : [];
  const relevantSubs = subcategories.filter(s => s.parent_key === form.category && s.type === form.type);
  const isTransfer = form.type === "transfer";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title || !form.amount) return;
    setSaving(true);

    const baseEntry = { ...form, amount: Number(form.amount), origin: "manual" };
    delete baseEntry.dest_bank_account_id;
    if (!baseEntry.competence_date && baseEntry.due_date) baseEntry.competence_date = baseEntry.due_date;

    if (editingEntry?.id) {
      const updated = await base44.entities.FinancialEntry.update(editingEntry.id, baseEntry);
      onCreate(updated);
      return;
    }

    if (isInstallment && installmentCount > 1) {
      const totalAmount = Number(form.amount);
      const perInstallment = Math.round((totalAmount / installmentCount) * 100) / 100;
      const groupId = `inst_${Date.now()}`;
      const entries = [];
      let currentDate = form.due_date ? new Date(form.due_date + "T12:00:00") : new Date();
      for (let i = 0; i < installmentCount; i++) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        entries.push({
          ...baseEntry,
          amount: i === installmentCount - 1 ? totalAmount - perInstallment * (installmentCount - 1) : perInstallment,
          due_date: dateStr,
          competence_date: dateStr,
          installment_group: groupId,
          installment_current: i + 1,
          installment_total: installmentCount,
          status: "forecast",
        });
        currentDate = addMonths(currentDate, 1);
      }
      await base44.entities.FinancialEntry.bulkCreate(entries);
      onCreate(entries);
      return;
    }

    if (isRecurring && recurringCount > 1) {
      const entries = [];
      let currentDate = form.due_date ? new Date(form.due_date + "T12:00:00") : new Date();
      for (let i = 0; i < recurringCount; i++) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        entries.push({ ...baseEntry, due_date: dateStr, competence_date: dateStr, status: "forecast" });
        currentDate = advanceDate(currentDate, recurringInterval);
      }
      await base44.entities.FinancialEntry.bulkCreate(entries);
      onCreate(entries[0]);
    } else {
      const created = await base44.entities.FinancialEntry.create(baseEntry);
      onCreate(created);
    }
  }

  const typeColors = {
    revenue: { active: "bg-green-100 text-green-700 border-green-300", ring: "ring-green-400" },
    expense: { active: "bg-red-100 text-red-700 border-red-300", ring: "ring-red-400" },
    transfer: { active: "bg-blue-100 text-blue-700 border-blue-300", ring: "ring-blue-400" },
  };

  const drawerFooter = (
    <div className="flex gap-3">
      <Button type="submit" form="entry-form" disabled={saving} className={`flex-1 ${form.type === "revenue" ? "bg-green-600 hover:bg-green-700" : form.type === "expense" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}>
        {saving ? "Salvando..." : editingEntry ? "Salvar" : isInstallment ? `Criar ${installmentCount} Parcelas` : isRecurring ? `Criar ${recurringCount} Lançamentos` : "Criar Lançamento"}
      </Button>
    </div>
  );

  return (
    <StandardDrawer
      open={true}
      onClose={onClose}
      title={editingEntry ? "Editar Lançamento" : "Novo Lançamento"}
      footer={drawerFooter}
    >
      <form id="entry-form" onSubmit={handleSubmit}>
        <div className="space-y-3 py-4 px-6">

            {/* ── TIPO ── */}
            {!editingEntry && (
              <div className="flex gap-2">
                {[
                  { v: "revenue", label: "Receita" },
                  { v: "expense", label: "Despesa" },
                  { v: "transfer", label: "Transferência" },
                ].map(t => (
                  <button key={t.v} type="button"
                    onClick={() => setForm(f => ({ ...f, type: t.v, category: "", subcategory_id: "", subcategory_name: "" }))}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all ${form.type === t.v ? typeColors[t.v].active : "bg-muted/50 text-muted-foreground border-transparent"}`}
                  >{t.label}</button>
                ))}
              </div>
            )}

            {/* ── IDENTIFICAÇÃO ── */}
            <SectionLabel>Identificação</SectionLabel>
            <div>
              <FieldLabel required>Título</FieldLabel>
              <Input placeholder={isTransfer ? "Ex: Transferência entre contas" : form.type === "revenue" ? "Ex: FEE Mensal — Cliente X" : "Ex: Aluguel escritório"} value={form.title} onChange={set("title")} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Valor (R$)</FieldLabel>
                <Input type="number" step="0.01" placeholder="0,00" value={form.amount} onChange={set("amount")} required />
              </div>
              <div>
                <FieldLabel>Vencimento</FieldLabel>
                <Input type="date" value={form.due_date} onChange={set("due_date")} />
              </div>
            </div>

            {/* ── CLASSIFICAÇÃO ── */}
            {!isTransfer && (
              <>
                <SectionLabel>Classificação</SectionLabel>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Categoria</FieldLabel>
                    <SelectField
                      value={form.category}
                      onChange={val => setForm(f => ({ ...f, category: val, subcategory_id: "", subcategory_name: "" }))}
                      options={categories}
                      placeholder="Selecionar categoria"
                    />
                  </div>
                  <div>
                    <FieldLabel>Subcategoria</FieldLabel>
                    <SelectField
                      value={form.subcategory_id}
                      onChange={val => {
                        const sub = relevantSubs.find(s => s.id === val);
                        setForm(f => ({ ...f, subcategory_id: val, subcategory_name: sub?.name || "" }));
                      }}
                      options={relevantSubs.map(s => ({ value: s.id, label: s.name }))}
                      placeholder={relevantSubs.length === 0 ? "Nenhuma disponível" : "Selecionar"}
                    />
                  </div>
                </div>

                {form.type === "expense" && (
                  <div>
                    <FieldLabel>Tipo de Gasto</FieldLabel>
                    <div className="flex gap-2">
                      {[
                        { v: "fixed", label: "Fixo", active: "bg-purple-100 text-purple-700 border-purple-300" },
                        { v: "variable", label: "Variável", active: "bg-amber-100 text-amber-700 border-amber-300" },
                      ].map(t => (
                        <button key={t.v} type="button"
                          onClick={() => setForm(f => ({ ...f, expense_type: f.expense_type === t.v ? "" : t.v }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.expense_type === t.v ? t.active : "bg-muted text-muted-foreground border-transparent"}`}
                        >{t.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Centro de Custo</FieldLabel>
                    <SelectField
                      value={form.cost_center}
                      onChange={set("cost_center")}
                      options={costCenters.map(cc => ({ value: cc.name, label: cc.name }))}
                      placeholder="Nenhum"
                    />
                  </div>
                  <div>
                    <FieldLabel>Status</FieldLabel>
                    <SelectField value={form.status} onChange={set("status")} options={STATUSES} placeholder="Status" />
                  </div>
                </div>
              </>
            )}

            {/* ── VÍNCULO ── */}
            <SectionLabel>{isTransfer ? "Contas" : "Vínculo"}</SectionLabel>

            {isTransfer ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Banco Origem</FieldLabel>
                  <SelectField
                    value={form.bank_account_id}
                    onChange={id => handleAccountChange(id)}
                    options={accounts.map(a => ({ value: a.id, label: a.name }))}
                    placeholder="Selecionar"
                  />
                </div>
                <div>
                  <FieldLabel>Banco Destino</FieldLabel>
                  <SelectField
                    value={form.dest_bank_account_id}
                    onChange={val => setForm(f => ({ ...f, dest_bank_account_id: val }))}
                    options={accounts.filter(a => a.id !== form.bank_account_id).map(a => ({ value: a.id, label: a.name }))}
                    placeholder="Selecionar"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Cliente</FieldLabel>
                  <SelectField
                    value={form.client_id}
                    onChange={handleClientChange}
                    options={clients.map(c => ({ value: c.id, label: c.name }))}
                    placeholder="Nenhum"
                  />
                </div>
                <div>
                  <FieldLabel>Conta Bancária</FieldLabel>
                  <SelectField
                    value={form.bank_account_id}
                    onChange={id => handleAccountChange(id)}
                    options={accounts.map(a => ({ value: a.id, label: a.name }))}
                    placeholder="Nenhuma"
                  />
                </div>
              </div>
            )}

            {/* ── AVANÇADO (colapsável) ── */}
            {!isTransfer && (
              <div>
                <button type="button" onClick={() => setShowAdvanced(v => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline mt-1">
                  {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showAdvanced ? "Ocultar campos avançados" : "Campos avançados"}
                </button>
                {showAdvanced && (
                  <div className="mt-2 space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Data de Competência</FieldLabel>
                        <Input type="date" value={form.competence_date} onChange={set("competence_date")} />
                      </div>
                      <div>
                        <FieldLabel>Data de Pagamento</FieldLabel>
                        <Input type="date" value={form.payment_date} onChange={set("payment_date")} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Nº Documento</FieldLabel>
                        <Input placeholder="NF, boleto, etc." value={form.document_number} onChange={set("document_number")} />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 cursor-pointer py-2">
                          <input type="checkbox" checked={form.has_invoice} onChange={e => setForm(f => ({ ...f, has_invoice: e.target.checked }))} className="w-4 h-4 rounded accent-primary" />
                          <span className="text-xs font-semibold text-foreground">Possui nota fiscal</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PARCELAMENTO / RECORRÊNCIA ── */}
            {!editingEntry && !isTransfer && (
              <>
                {/* Installment */}
                <div className={`rounded-xl border p-3 ${isInstallment ? "border-blue-300 bg-blue-50/50 dark:bg-blue-900/10" : "border-border bg-muted/20"}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={isInstallment} onChange={e => { setIsInstallment(e.target.checked); if (e.target.checked) setIsRecurring(false); }} className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-sm font-semibold text-foreground">Parcelar</span>
                  </label>
                  {isInstallment && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Nº Parcelas</FieldLabel>
                        <Input type="number" min={2} max={120} value={installmentCount} onChange={e => setInstallmentCount(Number(e.target.value))} />
                      </div>
                      {form.amount && (
                        <div className="flex items-end">
                          <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-200 rounded-lg px-3 py-2 w-full">
                            <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                              {installmentCount}x de R$ {(Number(form.amount) / installmentCount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Recurring */}
                {!isInstallment && (
                  <div className={`rounded-xl border p-3 ${isRecurring ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20"}`}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
                      <div className="flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${isRecurring ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-sm font-semibold text-foreground">Repetir lançamento</span>
                      </div>
                    </label>
                    {isRecurring && (
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <FieldLabel>Intervalo</FieldLabel>
                          <SelectField value={recurringInterval} onChange={setRecurringInterval} options={RECURRING_INTERVALS} />
                        </div>
                        <div>
                          <FieldLabel>Repetições</FieldLabel>
                          <Input type="number" min={1} max={120} value={recurringCount} onChange={e => setRecurringCount(Number(e.target.value))} />
                        </div>
                        <div className="col-span-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                          <p className="text-xs font-semibold text-primary">
                            Serão criados <strong>{recurringCount}</strong> lançamentos — {RECURRING_INTERVALS.find(i => i.value === recurringInterval)?.label}
                          </p>
                          {form.amount && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Total: R$ {(Number(form.amount) * recurringCount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── NOTAS ── */}
            {!isTransfer && (
              <div>
                <FieldLabel>Observações</FieldLabel>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={2}
                  placeholder="Observações opcionais..."
                  value={form.notes}
                  onChange={set("notes")}
                />
              </div>
            )}

            </div>
          </form>
    </StandardDrawer>
  );
}