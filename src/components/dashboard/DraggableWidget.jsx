import { GripVertical, EyeOff } from "lucide-react";

export default function DraggableWidget({ children, dragHandleProps, isEditMode, onHide, label }) {
  return (
    <div className="relative group">
      {isEditMode && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-card border border-border rounded-full px-2 py-0.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium max-w-[120px] truncate">{label}</span>
          {onHide && (
            <button onClick={onHide} className="p-1 text-muted-foreground hover:text-destructive no-touch-min" style={{ minHeight: "unset", minWidth: "unset" }}>
              <EyeOff className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      {isEditMode && (
        <div className="absolute inset-0 border-2 border-dashed border-primary/30 rounded-2xl pointer-events-none z-[1]" />
      )}
      {children}
    </div>
  );
}