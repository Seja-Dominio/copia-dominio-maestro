import { Button } from "@/components/ui/button";
import { CheckCircle2, X, Ban, Trash2 } from "lucide-react";

export default function BulkActionBar({ count, onMarkPaid, onCancel, onDelete, onClear }) {
  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 py-2.5 flex items-center gap-3 rounded-t-xl">
      <span className="text-sm font-bold">{count} selecionado{count > 1 ? "s" : ""}</span>
      <div className="flex-1" />
      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5 h-7 text-xs bg-green-600 text-white hover:bg-green-700"
        onClick={onMarkPaid}
      >
        <CheckCircle2 className="w-3.5 h-3.5" /> Realizar
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="gap-1.5 h-7 text-xs bg-gray-600 text-white hover:bg-gray-700"
        onClick={onCancel}
      >
        <Ban className="w-3.5 h-3.5" /> Cancelar
      </Button>
      {onDelete && (
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5 h-7 text-xs bg-red-600 text-white hover:bg-red-700"
          onClick={onDelete}
        >
          <Trash2 className="w-3.5 h-3.5" /> Apagar
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="gap-1 h-7 text-xs text-primary-foreground hover:bg-primary/80"
        onClick={onClear}
      >
        <X className="w-3.5 h-3.5" /> Limpar
      </Button>
    </div>
  );
}