/**
 * MobileSelect — native bottom-sheet style select for mobile,
 * falls back to standard shadcn Select on desktop.
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, X } from "lucide-react";

export function MobileSelect({ value, onChange, options = [], placeholder = "Selecionar", className = "" }) {
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find(o => o.value === value)?.label ?? placeholder;

  const handleSelect = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center justify-between w-full h-9 px-3 py-1 rounded-md border border-input bg-background text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground"}>{selectedLabel}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* Bottom sheet overlay */}
      <AnimatePresence>
        {open && (
          <>
            {/* Scrim */}
            <motion.div
              className="fixed inset-0 z-[200] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            {/* Sheet — fixed below header with side margins */}
            <motion.div
              className="fixed z-[201] bg-card rounded-2xl shadow-2xl overflow-hidden"
              style={{ top: "calc(56px + 20px)", left: 20, right: 20, maxHeight: "calc(100vh - 56px - 40px)" }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-2 border-b border-border">
                <span className="text-sm font-semibold text-foreground">{placeholder}</span>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-full hover:bg-muted">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Options */}
              <div className="overflow-y-auto max-h-[50vh] py-2 pb-[5px]">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className="flex items-center justify-between w-full px-5 py-3.5 text-sm text-foreground hover:bg-muted/60 active:bg-muted transition-colors"
                  >
                    <span>{opt.label}</span>
                    {value === opt.value && <Check className="w-4 h-4 text-primary" />}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}