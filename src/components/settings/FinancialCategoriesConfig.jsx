import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, Check, X,
  DollarSign, TrendingDown, FolderTree
} from "lucide-react";

// Categorias fixas do sistema (do enum FinancialEntry.category)
const SYSTEM_CATEGORIES = {
  revenue: [
    { key: "fee",        label: "Fee Mensal" },
    { key: "production", label: "Produção" },
    { key: "media",      label: "Mídia" },
    { key: "other",      label: "Outros (Receita)" },
  ],
  expense: [
    { key: "supplier",   label: "Fornecedores" },
    { key: "salary",     label: "Pessoal / Salários" },
    { key: "tax",        label: "Impostos" },
    { key: "tools",      label: "Ferramentas" },
    { key: "rent",       label: "Aluguel" },
    { key: "other_exp",  label: "Outros (Despesa)" },
  ],
};

function SubcategoryItem({ cat, onToggle, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(cat.name);

  const handleSave = () => {
    if (editName.trim()) {
      onEdit(cat.id, editName.trim());
      setEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-md hover:bg-muted/50 group">
      <div className="w-4" />
      {editing ? (
        <div className="flex items-center gap-1 flex-1">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="h-7 text-sm flex-1"
            autoFocus
            onKeyDown={e => e.key === "Enter" && handleSave()}
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave}>
            <Check className="w-3.5 h-3.5 text-green-600" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : (
        <>
          <span className={`text-sm flex-1 ${!cat.is_active ? "line-through text-muted-foreground" : ""}`}>
            {cat.name}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Switch
              checked={cat.is_active}
              onCheckedChange={() => onToggle(cat.id, !cat.is_active)}
              className="scale-75"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditName(cat.name); setEditing(true); }}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(cat.id)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function CategoryGroup({ type, parentKey, label, subcategories, onAdd, onToggle, onDelete, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const subs = subcategories.filter(c => c.parent_key === parentKey);

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(parentKey, type, newName.trim());
      setNewName("");
      setAdding(false);
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        <span className="text-sm font-semibold flex-1 text-left">{label}</span>
        <Badge variant="secondary" className="text-xs no-touch-min">
          {subs.length} sub
        </Badge>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 py-1 px-1">
          {subs.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground px-7 py-2">Nenhuma subcategoria</p>
          )}
          {subs.sort((a, b) => a.order - b.order).map(cat => (
            <SubcategoryItem key={cat.id} cat={cat} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
          ))}

          {adding ? (
            <div className="flex items-center gap-1 px-7 py-1.5">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Nome da subcategoria..."
                className="h-7 text-sm flex-1"
                autoFocus
                onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleAdd}>
                <Check className="w-3.5 h-3.5 text-green-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setAdding(false); setNewName(""); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-7 py-1.5 text-xs text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar subcategoria
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function FinancialCategoriesConfig() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    const data = await base44.entities.FinancialCategory.list("order", 200);
    setCategories(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const handleAdd = async (parentKey, type, name) => {
    const subs = categories.filter(c => c.parent_key === parentKey);
    await base44.entities.FinancialCategory.create({
      parent_key: parentKey,
      name,
      type,
      is_active: true,
      order: subs.length,
    });
    loadCategories();
  };

  const handleToggle = async (id, isActive) => {
    await base44.entities.FinancialCategory.update(id, { is_active: isActive });
    setCategories(prev => prev.map(c => c.id === id ? { ...c, is_active: isActive } : c));
  };

  const handleDelete = async (id) => {
    await base44.entities.FinancialCategory.delete(id);
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  const handleEdit = async (id, name) => {
    await base44.entities.FinancialCategory.update(id, { name });
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <FolderTree className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-lg font-bold">Plano de Contas</h2>
          <p className="text-sm text-muted-foreground">Gerencie subcategorias para receitas e despesas</p>
        </div>
      </div>

      {/* Receitas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-bold text-green-700">Receitas</h3>
        </div>
        {SYSTEM_CATEGORIES.revenue.map(sc => (
          <CategoryGroup
            key={sc.key}
            type="revenue"
            parentKey={sc.key}
            label={sc.label}
            subcategories={categories}
            onAdd={handleAdd}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={handleEdit}
          />
        ))}
      </div>

      {/* Despesas */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-orange-600" />
          <h3 className="text-sm font-bold text-orange-700">Despesas</h3>
        </div>
        {SYSTEM_CATEGORIES.expense.map(sc => (
          <CategoryGroup
            key={sc.key}
            type="expense"
            parentKey={sc.key}
            label={sc.label}
            subcategories={categories}
            onAdd={handleAdd}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={handleEdit}
          />
        ))}
      </div>
    </div>
  );
}