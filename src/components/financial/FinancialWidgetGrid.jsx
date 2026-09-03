import { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import DraggableWidget from "@/components/dashboard/DraggableWidget";
import { Button } from "@/components/ui/button";
import { GripVertical, Eye, EyeOff, Settings2 } from "lucide-react";

const DEFAULT_FINANCIAL_WIDGETS = [
  "revenue_forecast",
  "summary_cards",
  "pie_charts",
  "bank_accounts",
  "top_clients",
  "cash_flow",
  "entries_section",
];

export function getFinancialLayout(collaborator) {
  if (collaborator?.financial_layout?.length) return collaborator.financial_layout;
  return DEFAULT_FINANCIAL_WIDGETS;
}

export function getFinancialVisibility(collaborator) {
  if (collaborator?.financial_widgets && Object.keys(collaborator.financial_widgets).length > 0) {
    return collaborator.financial_widgets;
  }
  const vis = {};
  DEFAULT_FINANCIAL_WIDGETS.forEach(id => { vis[id] = true; });
  return vis;
}

export function useFinancialDragDrop() {
  const [isEditMode, setIsEditMode] = useState(false);
  const [widgetOrder, setWidgetOrder] = useState(DEFAULT_FINANCIAL_WIDGETS);
  const [visibleWidgets, setVisibleWidgets] = useState({});
  const [collaboratorId, setCollaboratorId] = useState(null);

  useEffect(() => {
    const collab = JSON.parse(sessionStorage.getItem("collaborator") || "null");
    if (collab?.id) {
      setCollaboratorId(collab.id);
      setWidgetOrder(getFinancialLayout(collab));
      setVisibleWidgets(getFinancialVisibility(collab));
    } else {
      const vis = {};
      DEFAULT_FINANCIAL_WIDGETS.forEach(id => { vis[id] = true; });
      setVisibleWidgets(vis);
    }
  }, []);

  const saveLayout = useCallback(async (newOrder, newVisibility) => {
    if (!collaboratorId) return;
    const update = { financial_layout: newOrder, financial_widgets: newVisibility };
    await base44.entities.Collaborator.update(collaboratorId, update);
    // Update session
    const collab = JSON.parse(sessionStorage.getItem("collaborator") || "{}");
    sessionStorage.setItem("collaborator", JSON.stringify({ ...collab, ...update }));
  }, [collaboratorId]);

  const handleReorder = useCallback((result) => {
    if (!result.destination) return;
    const items = [...widgetOrder];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setWidgetOrder(items);
    saveLayout(items, visibleWidgets);
  }, [widgetOrder, visibleWidgets, saveLayout]);

  const toggleVisibility = useCallback((id) => {
    const next = { ...visibleWidgets, [id]: !visibleWidgets[id] };
    setVisibleWidgets(next);
    saveLayout(widgetOrder, next);
  }, [visibleWidgets, widgetOrder, saveLayout]);

  return { isEditMode, setIsEditMode, widgetOrder, visibleWidgets, handleReorder, toggleVisibility };
}

export function FinancialEditBar({ isEditMode, setIsEditMode, widgetOrder, visibleWidgets, toggleVisibility, widgetLabels }) {
  if (!isEditMode) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsEditMode(true)} className="gap-1.5 text-xs">
        <Settings2 className="w-3.5 h-3.5" /> Reorganizar
      </Button>
    );
  }

  return (
    <div className="glass-card p-3 mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Modo edição — arraste para reorganizar</span>
      </div>
      <div className="flex flex-wrap gap-1.5 flex-1">
        {widgetOrder.map(id => (
          <button
            key={id}
            onClick={() => toggleVisibility(id)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
              visibleWidgets[id] !== false
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-muted text-muted-foreground border-border line-through opacity-60"
            }`}
          >
            {visibleWidgets[id] !== false ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            {widgetLabels[id] || id}
          </button>
        ))}
      </div>
      <Button size="sm" onClick={() => setIsEditMode(false)} className="text-xs">Concluir</Button>
    </div>
  );
}

export function FinancialDragGrid({ isEditMode, widgetOrder, visibleWidgets, handleReorder, widgetRegistry }) {
  const visibleItems = widgetOrder.filter(id => visibleWidgets[id] !== false && widgetRegistry[id]);

  if (!isEditMode) {
    return (
      <>
        {visibleItems.map(id => {
          const w = widgetRegistry[id];
          if (!w) return null;
          return <div key={id}>{w.render()}</div>;
        })}
      </>
    );
  }

  return (
    <DragDropContext onDragEnd={handleReorder}>
      <Droppable droppableId="financial-widgets">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
            {visibleItems.map((id, index) => {
              const w = widgetRegistry[id];
              if (!w) return null;
              return (
                <Draggable key={id} draggableId={id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`transition-shadow ${snapshot.isDragging ? "shadow-2xl opacity-90 z-50" : ""}`}
                    >
                      <DraggableWidget
                        dragHandleProps={provided.dragHandleProps}
                        isEditMode={true}
                        onHide={() => {}}
                        label={w.label}
                      >
                        {w.render()}
                      </DraggableWidget>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}