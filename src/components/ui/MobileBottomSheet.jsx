/**
 * Reusable mobile bottom sheet component.
 * Wraps content in a slide-up sheet with scrim + drag-to-close handle.
 */
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export default function MobileBottomSheet({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] bg-black/40"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-[201] bg-card rounded-t-2xl shadow-2xl safe-bottom max-h-[85vh] flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            {title && (
              <div className="flex items-center justify-between px-5 py-2 border-b border-border flex-shrink-0">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto flex-1 pb-4">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}