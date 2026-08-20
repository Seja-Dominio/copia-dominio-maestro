import { createContext, useContext, useState, useCallback, useRef } from "react";
import { AlertTriangle } from "lucide-react";

const ConfirmDeleteContext = createContext(null);

export function useConfirmDelete() {
  return useContext(ConfirmDeleteContext);
}

export function ConfirmDeleteProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirmDelete = useCallback(({ title, message, actionLabel } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        title: title || "Confirmar exclusão",
        message: message || "Tem certeza que deseja excluir? Esta ação não pode ser desfeita.",
        actionLabel: actionLabel || "Excluir",
      });
    });
  }, []);

  const handleConfirm = () => {
    resolveRef.current?.(true);
    setState(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setState(null);
  };

  return (
    <ConfirmDeleteContext.Provider value={confirmDelete}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={handleCancel}>
          <div className="absolute inset-0 bg-black/50 animate-fade-in" />
          <div
            className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">{state.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{state.message}</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={handleCancel}
                className="px-4 h-9 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 h-9 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors"
              >
                {state.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDeleteContext.Provider>
  );
}