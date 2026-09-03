import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

/**
 * Drawer padrão global.
 * - Portal no document.body
 * - position: fixed, top: 60px (abaixo do header)
 * - height: calc(100vh - 70px)
 * - width customizável (padrão 680px)
 * - Overlay escuro cobrindo toda a viewport
 * - Header fixo + conteúdo com scroll + footer fixo
 */
export default function StandardDrawer({ open, onClose, title, width = 680, children, footer }) {
  if (!open) return null;

  return createPortal(
    <div
      style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999, background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        style={{
          position: "fixed",
          top: 60,
          left: "50%",
          transform: "translateX(-50%)",
          width,
          maxWidth: "calc(100% - 2rem)",
          height: "calc(100vh - 70px)",
          maxHeight: "calc(100vh - 70px)",
          zIndex: 10000,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        className="bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border" style={{ flexShrink: 0, padding: "16px 24px" }}>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {children}
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div className="border-t border-border" style={{ flexShrink: 0, padding: "16px 24px" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}