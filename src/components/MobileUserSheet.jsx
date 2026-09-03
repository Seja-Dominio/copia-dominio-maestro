import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, HelpCircle, Settings, LogOut, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function MobileUserSheet({ user, darkMode, onToggleDark, onLogout, isAdmin }) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      {/* Trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Menu do usuário"
        className="flex items-center gap-2 h-8 px-2 rounded-md hover:bg-accent transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
          {user?.full_name?.[0]?.toUpperCase() || "U"}
        </div>
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {/* Overlay + Sheet */}
      <AnimatePresence>
        {open && (
          <>
            {/* Scrim */}
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={close}
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[70] bg-card rounded-t-2xl shadow-2xl safe-bottom"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              {/* User info */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                      {user?.full_name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{user?.full_name || "Usuário"}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                  <button onClick={close} aria-label="Fechar" className="p-1.5 rounded-full hover:bg-muted transition-colors">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="p-3 space-y-1">
                <button
                  onClick={() => { onToggleDark(); close(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors text-left"
                >
                  {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />}
                  {darkMode ? "Modo Claro" : "Modo Escuro"}
                </button>

                <button
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors text-left"
                  onClick={close}
                >
                  <HelpCircle className="w-5 h-5 text-muted-foreground" />
                  Ajuda
                </button>

                {isAdmin && (
                  <Link to="/Configuracoes" onClick={close} className="no-underline">
                    <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors text-left">
                      <Settings className="w-5 h-5 text-muted-foreground" />
                      Configurações
                    </button>
                  </Link>
                )}

                <Link to="/Settings" onClick={close} className="no-underline">
                  <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors text-left">
                    <Settings className="w-5 h-5 text-muted-foreground" />
                    Minha Conta
                  </button>
                </Link>

                <div className="pt-1 border-t border-border mt-1">
                  <button
                    onClick={() => { close(); onLogout(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors text-left"
                  >
                    <LogOut className="w-5 h-5" />
                    Sair
                  </button>
                </div>
              </div>

              {/* Bottom safe area spacer */}
              <div className="h-2" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}