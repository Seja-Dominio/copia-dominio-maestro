import { useState } from "react";
import { Settings, Eye, EyeOff, X, GripVertical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { base44 } from "@/api/base44Client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

export const WIDGET_OPTIONS = [
  { id: "my_alerts", label: "Meus Alertas", adminOnly: false },
  { id: "my_overdue", label: "Minhas Entregas Atrasadas", adminOnly: false },
  { id: "kpi_cards", label: "KPIs (Clientes, Atrasados, NPS)", adminOnly: false },
  { id: "alert_banners_team", label: "Alertas da Equipe", adminOnly: true },
  { id: "financial_section", label: "Financeiro", adminOnly: true },
  { id: "next_posts", label: "Próximas Postagens — 5 dias", adminOnly: false },
  { id: "overdue_jobs_team", label: "Entregas Atrasadas (equipe)", adminOnly: true },
  { id: "nps_panel", label: "NPS Mais Baixos", adminOnly: false },
  { id: "contract_expiry", label: "Vencimentos de Contrato", adminOnly: false },
  { id: "birthdays", label: "Aniversários", adminOnly: false },
  { id: "top_clients", label: "Top Clientes — Horas", adminOnly: false },
  { id: "client_activities", label: "Atividades-Chave por Cliente", adminOnly: true },
  { id: "timesheet_monitor", label: "Monitor de Timesheet", adminOnly: true },
  { id: "productivity", label: "Produtividade Compilada", adminOnly: false },
  { id: "daily_summary", label: "Resumo Diário", adminOnly: true },
  { id: "client_attention", label: "Atenção aos Clientes (IA)", adminOnly: true },
  { id: "schedule_trust", label: "Confiança no Cronograma", adminOnly: true },
];

const DEFAULT_ORDER = WIDGET_OPTIONS.map(w => w.id);

export function getVisibleWidgets(collaborator) {
  const saved = collaborator?.dashboard_widgets;
  if (!saved || Object.keys(saved).length === 0) {
    const defaults = {};
    WIDGET_OPTIONS.forEach(w => { defaults[w.id] = true; });
    return defaults;
  }
  const result = {};
  WIDGET_OPTIONS.forEach(w => {
    result[w.id] = saved[w.id] !== undefined ? saved[w.id] : true;
  });
  return result;
}

export function getWidgetOrder(collaborator) {
  const saved = collaborator?.dashboard_layout;
  if (saved && Array.isArray(saved) && saved.length > 0) {
    // Add any new widgets not in saved order
    const missing = DEFAULT_ORDER.filter(id => !saved.includes(id));
    return [...saved, ...missing];
  }
  return [...DEFAULT_ORDER];
}

export default function DashboardWidgetConfig({ collaboratorId, currentWidgets, currentOrder, onSave }) {
  const [open, setOpen] = useState(false);
  const [widgets, setWidgets] = useState(currentWidgets);
  const [order, setOrder] = useState(currentOrder);
  const [saving, setSaving] = useState(false);

  const handleOpen = () => {
    const synced = {};
    WIDGET_OPTIONS.forEach(w => { synced[w.id] = currentWidgets[w.id] !== false; });
    setWidgets(synced);
    setOrder([...currentOrder]);
    setOpen(true);
  };

  const toggle = (id) => {
    setWidgets(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const items = [...order];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setOrder(items);
  };

  const handleReset = () => {
    const defaults = {};
    WIDGET_OPTIONS.forEach(w => { defaults[w.id] = true; });
    setWidgets(defaults);
    setOrder([...DEFAULT_ORDER]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Collaborator.update(collaboratorId, {
        dashboard_widgets: widgets,
        dashboard_layout: order,
      });
      const session = sessionStorage.getItem("collaborator");
      if (session) {
        const collab = JSON.parse(session);
        collab.dashboard_widgets = widgets;
        collab.dashboard_layout = order;
        sessionStorage.setItem("collaborator", JSON.stringify(collab));
      }
      onSave(widgets, order);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const visibleCount = WIDGET_OPTIONS.filter(w => widgets[w.id] !== false).length;

  // Ordered list for display
  const orderedOptions = order.map(id => WIDGET_OPTIONS.find(w => w.id === id)).filter(Boolean);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={handleOpen} className="gap-2 h-8 text-xs">
        <Settings className="w-3.5 h-3.5" />
        Personalizar
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
      <div className="absolute right-6 top-[76px] bg-card border border-border rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Personalizar Dashboard</h3>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleReset} className="text-muted-foreground hover:text-foreground p-1 no-touch-min" style={{ minHeight: "unset", minWidth: "unset" }} title="Restaurar padrão">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <p className="text-xs text-muted-foreground mb-3">
            Arraste para reordenar e ative/desative widgets. ({visibleCount}/{WIDGET_OPTIONS.length} visíveis)
          </p>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="widget-config">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                  {orderedOptions.map((w, index) => (
                    <Draggable key={w.id} draggableId={w.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${
                            snapshot.isDragging ? "bg-primary/10 shadow-lg" : "hover:bg-muted/50"
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground no-touch-min" style={{ minHeight: "unset", minWidth: "unset" }}>
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                            {widgets[w.id] !== false ? (
                              <Eye className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            ) : (
                              <EyeOff className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className={`text-xs font-medium truncate ${widgets[w.id] !== false ? "text-foreground" : "text-muted-foreground"}`}>
                              {w.label}
                            </span>
                          </div>
                          <Switch
                            checked={widgets[w.id] !== false}
                            onCheckedChange={() => toggle(w.id)}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-xs">
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs gap-1">
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}