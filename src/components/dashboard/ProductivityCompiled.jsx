import { useState, useEffect, useRef } from "react";
import { Activity, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const INACTIVITY_TIMEOUT = 2 * 60 * 60 * 1000; // 2 horas em ms

export default function ProductivityCompiled({ timesheetByCollab, resolvedCollaborator }) {
  const [isInactive, setIsInactive] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const inactivityTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  useEffect(() => {
    function resetInactivityTimer() {
      if (isInactive) {
        setIsInactive(false);
        setElapsedTime(0);
      }

      // Limpar timer anterior
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      // Novo timer de 2 horas
      inactivityTimerRef.current = setTimeout(() => {
        setIsInactive(true);
      }, INACTIVITY_TIMEOUT);

      // Countdown visual
      let remaining = INACTIVITY_TIMEOUT;
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1000;
        setElapsedTime(Math.floor((INACTIVITY_TIMEOUT - remaining) / 60000));
      }, 1000);
    }

    // Escutadores de interação
    window.addEventListener("click", resetInactivityTimer);
    window.addEventListener("keydown", resetInactivityTimer);
    window.addEventListener("mousemove", resetInactivityTimer);

    resetInactivityTimer();

    return () => {
      window.removeEventListener("click", resetInactivityTimer);
      window.removeEventListener("keydown", resetInactivityTimer);
      window.removeEventListener("mousemove", resetInactivityTimer);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [isInactive]);

  const myCollabTimesheet = timesheetByCollab.find(t => t.id === resolvedCollaborator?.id);
  const totalHours = myCollabTimesheet?.total_hours || 0;
  const totalMinutes = myCollabTimesheet?.total_minutes || 0;

  if (isInactive) {
    return (
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-3xl shadow-2xl max-w-md w-full overflow-hidden">
          {/* Gradient Header */}
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-8 text-white text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-3" />
            <h2 className="text-2xl font-bold">Ei, você aí? 👋</h2>
            <p className="text-sm text-white/80 mt-2">Você está há mais de 2 horas sem clicar no sistema</p>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            {/* Stats */}
            <div className="bg-muted/40 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Activity className="w-5 h-5 text-primary" />
                <span className="text-sm font-semibold text-muted-foreground">Produtividade de Hoje</span>
              </div>
              <div className="text-3xl font-black text-foreground">
                {totalHours}h <span className="text-lg font-semibold text-muted-foreground">{String(Math.round((totalMinutes % 60))).padStart(2, '0')}m</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Você trabalhou por <span className="font-semibold">{totalMinutes}</span> minutos
              </p>
            </div>

            {/* Message */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-center">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Que tal fazer um descanso? ☕
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-300 mt-1">
                Você merece uma pausa!
              </p>
            </div>

            {/* Action Button */}
            <Button
              onClick={() => {
                setIsInactive(false);
                setElapsedTime(0);
              }}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Voltar ao trabalho
            </Button>

            {/* Footer */}
            <p className="text-center text-xs text-muted-foreground">
              O contador será reiniciado quando você voltar a interagir com o sistema
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}