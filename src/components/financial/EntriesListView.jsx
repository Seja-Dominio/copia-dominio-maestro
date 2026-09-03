/* EntriesListView - replaces FinancialEntriesList */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import {
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  DollarSign,
  Trash2
} from "lucide-react";
import BulkActionBar from "./BulkActionBar";

const TYPE_CONFIG = {
  revenue: { label: "Receita", icon: TrendingUp, color: "text-green-600", bg: "bg-green-100" },
  expense: { label: "Despesa", icon: TrendingDown, color: "text-destructive", bg: "bg-red-100" },
  transfer: { label: "Transferencia", icon: ArrowLeftRight, color: "text-blue-600", bg: "bg-blue-100" },
};

const STATUS_MAP = {
  forecast: { label: "A realizar", color: "bg-blue-100 text-blue-700" },
  pending: { label: "A realizar", color: "bg-blue-100 text-blue-700" },
  overdue: { label: "Vencido", color: "bg-red-100 text-red-700" },
  paid: { label: "Realizado", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelado", color: "bg-gray-100 text-gray-400" },
};

const CATEGORY_LABELS = {
  fee: "FEE", production: "Producao", media: "Midia", supplier: "Fornecedor",
  salary: "Salario", tax: "Imposto", tools: "Ferramentas", rent: "Aluguel", other: "Outros",
};

function EntryTitle({ entry }) {
  const hasInstallment = entry.installment_total && entry.installment_total > 1;
  return (
    <div>
      <span className="font-medium text-foreground">
        {entry.title}
        {hasInstallment && (
          <span className="text-muted-foreground font-normal ml-1">
            {entry.installment_current}/{entry.installment_total}
          </span>
        )}
      </span>
      {entry.expense_type && (
        <span className={"ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full " + (entry.expense_type === "fixed" ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-700")}>
          {entry.expense_type === "fixed" ? "Fixo" : "Variavel"}
        </span>
      )}
    </div>
  );
}

function CategoryCell({ entry }) {
  return (
    <div className="flex flex-col gap-0.5">
      {entry.category && (
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium inline-block w-fit">
          {CATEGORY_LABELS[entry.category] || entry.category}
        </span>
      )}
      {entry.subcategory_name && (
        <span className="text-[10px] text-muted-foreground pl-0.5">
          {"\u2514 " + entry.subcategory_name}
        </span>
      )}
    </div>
  );
}

function EntryRow({ entry, selected, onToggle, onEdit, onMarkPaid, onDelete, isAdmin, today }) {
  const tc = TYPE_CONFIG[entry.type] || TYPE_CONFIG.revenue;
  const sc = STATUS_MAP[entry.status] || STATUS_MAP.forecast;
  const TypeIcon = tc.icon;
  const isOverdue = entry.due_date && entry.due_date < today && entry.status !== "paid" && entry.status !== "cancelled";

  return (
    <tr
      className={"border-b border-border hover:bg-muted/40 transition-colors cursor-pointer " + (selected ? "bg-primary/5" : "")}
      onClick={() => onEdit(entry)}
    >
      <td className="px-3 py-3" onClick={(ev) => ev.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={() => onToggle(entry.id)} />
      </td>
      <td className="px-4 py-3">
        <div className={"w-6 h-6 " + tc.bg + " rounded flex items-center justify-center"}>
          <TypeIcon className={"w-3 h-3 " + tc.color} />
        </div>
      </td>
      <td className="px-4 py-3"><EntryTitle entry={entry} /></td>
      <td className="px-4 py-3"><CategoryCell entry={entry} /></td>
      <td className="px-4 py-3 text-muted-foreground text-xs">{entry.client_name || "\u2014"}</td>
      <td className={"px-4 py-3 text-xs font-medium " + (isOverdue ? "text-destructive" : "text-muted-foreground")}>
        {entry.due_date ? format(new Date(entry.due_date + "T12:00:00"), "dd/MM/yyyy") : "\u2014"}
      </td>
      <td className="px-4 py-3">
        <Badge className={sc.color + " border-0 text-xs"}>{sc.label}</Badge>
      </td>
      <td className={"px-4 py-3 text-right font-bold " + (entry.type === "revenue" ? "text-green-600" : entry.type === "expense" ? "text-destructive" : "text-blue-600")}>
        {(entry.type === "expense" ? "-" : "+") + "R$ " + (entry.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
      </td>
      <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          {(entry.status === "pending" || entry.status === "forecast" || entry.status === "overdue") && (
            <button onClick={() => onMarkPaid(entry)} className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-xs font-semibold whitespace-nowrap transition-all">
              <CheckCircle2 className="w-3 h-3" /> Realizar
            </button>
          )}
          {isAdmin && onDelete && (
            <button onClick={() => onDelete(entry)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all" title="Excluir">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function MobileEntryCard({ entry, selected, onToggle, onEdit, onMarkPaid, onDelete, isAdmin, today }) {
  const tc = TYPE_CONFIG[entry.type] || TYPE_CONFIG.revenue;
  const sc = STATUS_MAP[entry.status] || STATUS_MAP.forecast;
  const TypeIcon = tc.icon;
  const isOverdue = entry.due_date && entry.due_date < today && entry.status !== "paid" && entry.status !== "cancelled";

  return (
    <div className={"p-4 hover:bg-muted/30 cursor-pointer transition-colors " + (selected ? "bg-primary/5" : "")} onClick={() => onEdit(entry)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div onClick={(ev) => ev.stopPropagation()} className="pt-1">
            <Checkbox checked={selected} onCheckedChange={() => onToggle(entry.id)} />
          </div>
          <div className={"w-8 h-8 " + tc.bg + " rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"}>
            <TypeIcon className={"w-4 h-4 " + tc.color} />
          </div>
          <div className="min-w-0 flex-1">
            <EntryTitle entry={entry} />
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {entry.client_name && <span className="text-xs text-muted-foreground">{entry.client_name}</span>}
              <CategoryCell entry={entry} />
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge className={sc.color + " border-0 text-xs"}>{sc.label}</Badge>
              {entry.due_date && (
                <span className={"text-xs font-medium " + (isOverdue ? "text-destructive" : "text-muted-foreground")}>
                  {format(new Date(entry.due_date + "T12:00:00"), "dd/MM/yyyy")}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={"text-sm font-bold " + (entry.type === "revenue" ? "text-green-600" : entry.type === "expense" ? "text-destructive" : "text-blue-600")}>
            {(entry.type === "expense" ? "-" : "+") + "R$ " + (entry.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
          <div className="flex items-center gap-1.5" onClick={(ev) => ev.stopPropagation()}>
            {(entry.status === "pending" || entry.status === "forecast" || entry.status === "overdue") && (
              <button onClick={() => onMarkPaid(entry)} className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-xs font-semibold transition-all">
                <CheckCircle2 className="w-3 h-3" /> Realizar
              </button>
            )}
            {isAdmin && onDelete && (
              <button onClick={() => onDelete(entry)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EntriesListView({ entries, loading, onEdit, onMarkPaid, onDelete, onBulkAction, onBulkDelete, isAdmin }) {
  const [selected, setSelected] = useState(new Set());
  const today = format(new Date(), "yyyy-MM-dd");

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === entries.length) setSelected(new Set());
    else setSelected(new Set(entries.map((e) => e.id)));
  }

  function handleBulkAction(action) {
    const selectedEntries = entries.filter((e) => selected.has(e.id));
    if (onBulkAction) onBulkAction(action, selectedEntries);
    setSelected(new Set());
  }

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Nenhum lancamento encontrado</p>
      </div>
    );
  }

  const totalRev = entries.filter((e) => e.type === "revenue").reduce((s, e) => s + (e.amount || 0), 0);
  const totalExp = entries.filter((e) => e.type === "expense").reduce((s, e) => s + (e.amount || 0), 0);
  const saldo = totalRev - totalExp;

  return (
    <>
      <BulkActionBar
        count={selected.size}
        onMarkPaid={() => handleBulkAction("paid")}
        onCancel={() => handleBulkAction("cancelled")}
        onDelete={isAdmin && onBulkDelete ? () => {
          const selectedEntries = entries.filter(e => selected.has(e.id));
          onBulkDelete(selectedEntries);
          setSelected(new Set());
        } : undefined}
        onClear={() => setSelected(new Set())}
      />

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="px-3 py-3 w-8">
                <Checkbox checked={selected.size === entries.length && entries.length > 0} onCheckedChange={toggleAll} />
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Titulo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Categoria</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Cliente</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Vencimento</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Valor</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                selected={selected.has(e.id)}
                onToggle={toggleSelect}
                onEdit={onEdit}
                onMarkPaid={onMarkPaid}
                onDelete={onDelete}
                isAdmin={isAdmin}
                today={today}
              />
            ))}
          </tbody>
          {entries.length > 0 && (
            <tfoot className="bg-muted border-t border-border">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-xs text-muted-foreground">{entries.length} lancamentos</td>
                <td className="px-4 py-3 text-xs font-semibold text-muted-foreground text-right">Saldo</td>
                <td className="px-4 py-3 text-right font-bold text-foreground">
                  {"R$ " + saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="md:hidden divide-y divide-border">
        {entries.map((e) => (
          <MobileEntryCard
            key={e.id}
            entry={e}
            selected={selected.has(e.id)}
            onToggle={toggleSelect}
            onEdit={onEdit}
            onMarkPaid={onMarkPaid}
            onDelete={onDelete}
            isAdmin={isAdmin}
            today={today}
          />
        ))}
        <div className="px-4 py-3 bg-muted flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{entries.length} lancamentos</span>
          <span className="text-sm font-bold text-foreground">
            {"Saldo: R$ " + saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </>
  );
}