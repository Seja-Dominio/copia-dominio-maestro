import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { useConfirmDelete } from "@/components/ConfirmDeleteContext";
import { safeDelete } from "@/lib/safeDelete";

export default function SupplierFormModal({ supplier, onClose, onSave }) {
  const [formData, setFormData] = useState(supplier || {
    name: "",
    company_name: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
    category: "outro",
    contact_name: "",
    website: "",
    payment_terms: "",
    notes: "",
    status: "active",
  });
  const [loading, setLoading] = useState(false);
  const confirmDelete = useConfirmDelete();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      let result;
      if (supplier?.id) {
        await base44.entities.Supplier.update(supplier.id, formData);
        result = { ...supplier, ...formData };
      } else {
        result = await base44.entities.Supplier.create(formData);
      }
      onSave(result);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmDelete({ title: "Excluir fornecedor?", message: `"${supplier.name}" será permanentemente removido.` });
    if (!confirmed) return;
    setLoading(true);
    try {
      await safeDelete("supplier", "Supplier", supplier);
      onSave(null, true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier?.id ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          <div>
            <label className="text-sm font-semibold text-foreground">Nome</label>
            <Input name="name" value={formData.name} onChange={handleChange} placeholder="Nome do fornecedor" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Razão Social</label>
            <Input name="company_name" value={formData.company_name} onChange={handleChange} placeholder="Razão social" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">CNPJ</label>
            <Input name="cnpj" value={formData.cnpj} onChange={handleChange} placeholder="CNPJ" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Categoria</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="impressao">Impressão</option>
              <option value="midia">Mídia</option>
              <option value="tecnologia">Tecnologia</option>
              <option value="freelancer">Freelancer</option>
              <option value="equipamentos">Equipamentos</option>
              <option value="espaco">Espaço</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground">Email</label>
              <Input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="email@example.com" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">Telefone</label>
              <Input name="phone" value={formData.phone} onChange={handleChange} placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Contato</label>
            <Input name="contact_name" value={formData.contact_name} onChange={handleChange} placeholder="Nome do contato principal" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Endereço</label>
            <Input name="address" value={formData.address} onChange={handleChange} placeholder="Endereço completo" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Website</label>
            <Input name="website" value={formData.website} onChange={handleChange} placeholder="https://..." />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Condições de Pagamento</label>
            <Input name="payment_terms" value={formData.payment_terms} onChange={handleChange} placeholder="Ex: À vista, 30 dias..." />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Notas</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Observações sobre o fornecedor"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {supplier?.id && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={loading}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}