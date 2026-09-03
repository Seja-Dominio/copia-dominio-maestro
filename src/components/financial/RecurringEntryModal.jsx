import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { X, Plus, Trash2, Calendar } from "lucide-react";
import { format, addMonths, parseISO } from "date-fns";

export default function RecurringEntryModal({ isOpen, onClose, clients, onCreated }) {
  const [formData, setFormData] = useState({
    title: "",
    client_id: "",
    client_name: "",
    amount: "",
    type: "revenue",
    category: "fee",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(addMonths(new Date(), 12), "yyyy-MM-dd"),
  });

  const [generating, setGenerating] = useState(false);

  const handleClientChange = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    setFormData({
      ...formData,
      client_id: clientId,
      client_name: client?.name || "",
    });
  };

  const handleGenerate = async () => {
    if (!formData.title || !formData.client_id || !formData.amount || !formData.start_date || !formData.end_date) {
      alert("Preencha todos os campos obrigatórios");
      return;
    }

    const startDate = parseISO(formData.start_date);
    const endDate = parseISO(formData.end_date);

    if (startDate > endDate) {
      alert("Data inicial deve ser anterior à data final");
      return;
    }

    setGenerating(true);
    const entries = [];
    let currentDate = new Date(startDate);

    // Gerar lançamentos mensais
    while (currentDate <= endDate) {
      entries.push({
        title: formData.title,
        client_id: formData.client_id,
        client_name: formData.client_name,
        amount: parseFloat(formData.amount),
        type: formData.type,
        category: formData.category,
        due_date: format(currentDate, "yyyy-MM-dd"),
        competence_date: format(currentDate, "yyyy-MM-dd"),
        status: "forecast",
        origin: "manual",
      });

      // Próximo mês
      currentDate = addMonths(currentDate, 1);
    }

    try {
      await base44.entities.FinancialEntry.bulkCreate(entries);
      onCreated(entries);
      setFormData({
        title: "",
        client_id: "",
        client_name: "",
        amount: "",
        type: "revenue",
        category: "fee",
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: format(addMonths(new Date(), 12), "yyyy-MM-dd"),
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Erro ao gerar lançamentos");
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  const startDate = parseISO(formData.start_date);
  const endDate = parseISO(formData.end_date);
  const monthCount = endDate >= startDate 
    ? Math.round((endDate - startDate) / (1000 * 60 * 60 * 24 * 30)) + 1 
    : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Lançamento Recorrente</DialogTitle>
          <DialogDescription>
            Configure um lançamento que será repetido mensalmente até a data final
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Título */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Título *</label>
            <Input
              placeholder="Ex: Fee Mensal"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          {/* Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Tipo *</label>
              <select
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="revenue">Receita</option>
                <option value="expense">Despesa</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">Categoria *</label>
              <select
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="fee">Fee</option>
                <option value="production">Produção</option>
                <option value="media">Mídia</option>
                <option value="supplier">Fornecedor</option>
                <option value="salary">Salário</option>
                <option value="tax">Imposto</option>
                <option value="tools">Ferramentas</option>
                <option value="rent">Aluguel</option>
                <option value="other">Outro</option>
              </select>
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Cliente *</label>
            <select
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              value={formData.client_id}
              onChange={(e) => handleClientChange(e.target.value)}
            >
              <option value="">Selecione um cliente</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Valor */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Valor Mensal (R$) *</label>
            <Input
              type="number"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              step="0.01"
            />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Data Inicial *
              </label>
              <Input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Data Final *
              </label>
              <Input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>

          {/* Preview */}
          {monthCount > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
              <p className="text-xs font-semibold text-primary">
                Serão criados <strong>{monthCount}</strong> lançamento{monthCount > 1 ? 's' : ''} mensais
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Total: <strong>R$ {(parseFloat(formData.amount || 0) * monthCount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
              </p>
            </div>
          )}

          {/* Ações */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || !formData.title || !formData.client_id || !formData.amount}
              className="flex-1"
            >
              {generating ? "Criando..." : `Gerar ${monthCount} Lançamentos`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}