import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import DraggableWidget from "./DraggableWidget";

export default function DraggableWidgetGrid({
  widgetOrder,
  visibleWidgets,
  isEditMode,
  onReorder,
  onHide,
  widgetRegistry,
}) {
  const visibleItems = widgetOrder.filter(id => visibleWidgets[id] !== false && widgetRegistry[id]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const items = [...visibleItems];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    // Reconstruct full order: visible in new order + hidden items at end
    const hiddenItems = widgetOrder.filter(id => visibleWidgets[id] === false || !widgetRegistry[id]);
    onReorder([...items, ...hiddenItems]);
  };

  if (!isEditMode) {
    // In normal mode, just render widgets in order without DnD overhead
    return (
      <div className="space-y-4">
        {visibleItems.map(id => {
          const w = widgetRegistry[id];
          if (!w) return null;
          const Component = w.render;
          return (
            <div key={id} className={w.colSpan || ""}>
              <Component />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="dashboard-widgets">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
            {visibleItems.map((id, index) => {
              const w = widgetRegistry[id];
              if (!w) return null;
              const Component = w.render;
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
                        onHide={() => onHide(id)}
                        label={w.label}
                      >
                        <Component />
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