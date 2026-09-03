import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConfirmDeleteModal({ 
  title = "Excluir item?", 
  message = "Esta ação não pode ser desfeita.", 
  itemName = "",
  itemSubtext,
  confirmLabel = "Excluir",
  confirmLoadingLabel = "Excluindo...",
  confirmVariant = "destructive",
  isOpen = false,
  isLoading = false,
  onConfirm,
  onCancel 
}) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4" style={{ zIndex: 10100 }}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border overflow-hidden">
        <div className="flex items-start gap-3 p-6">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${confirmVariant === "destructive" ? "bg-red-100 dark:bg-red-900/20" : "bg-primary/10"}`}>
            <AlertTriangle className={`w-5 h-5 ${confirmVariant === "destructive" ? "text-red-600" : "text-primary"}`} />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            {itemName && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-semibold text-foreground">"{itemName}"</span>{itemSubtext || " será permanentemente removido."}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2">{message}</p>
          </div>
          <button 
            onClick={onCancel}
            disabled={isLoading}
            className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex gap-2 px-6 py-4 border-t border-border bg-muted/30">
          <Button 
            variant="outline" 
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button 
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 ${confirmVariant === "destructive" ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
            variant={confirmVariant === "destructive" ? undefined : "default"}
          >
            {isLoading ? confirmLoadingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}