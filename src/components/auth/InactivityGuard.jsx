import { useEffect, useState, useRef, useCallback } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const INACTIVITY_TIMEOUT = 120 * 60 * 1000; // 120 minutos
const WARNING_BEFORE = 2 * 60 * 1000; // aviso 2 min antes
const TIMESHEET_INACTIVITY = 120 * 60 * 1000; // 2h para parar timesheets

async function stopAllRunningTimesheets(capAt) {
  try {
    const session = JSON.parse(sessionStorage.getItem("collaborator") || "null");
    if (!session?.id) return;
    const running = await base44.entities.Timesheet.filter({ collaborator_id: session.id, is_running: true });
    if (!running.length) return;
    const now = new Date();
    await Promise.all(running.map(ts => {
      let dur = Math.floor((now - new Date(ts.started_at)) / 60000);
      // Se capAt (timestamp da última atividade), limitar duração até esse momento
      if (capAt) dur = Math.max(1, Math.floor((capAt - new Date(ts.started_at).getTime()) / 60000));
      const endTime = capAt ? new Date(capAt).toISOString() : now.toISOString();
      return base44.entities.Timesheet.update(ts.id, {
        is_running: false,
        ended_at: endTime,
        duration_minutes: Math.max(1, dur),
      });
    }));
  } catch (e) {
    console.warn("Erro ao parar timesheets:", e);
  }
}

export default function InactivityGuard({ onLogout }) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(120);
  const warningTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const showWarningRef = useRef(false);
  const lastActivityRef = useRef(Date.now());

  const doLogout = useCallback(async () => {
    await stopAllRunningTimesheets();
    onLogout();
  }, [onLogout]);

  const clearAllTimers = useCallback(() => {
    clearTimeout(warningTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    clearInterval(countdownRef.current);
  }, []);

  const startTimers = useCallback(() => {
    clearAllTimers();
    lastActivityRef.current = Date.now();

    // Timer para mostrar aviso (118 min)
    warningTimerRef.current = setTimeout(() => {
      showWarningRef.current = true;
      setShowWarning(true);
      setCountdown(120);

      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE);

    // Timer para logout (120 min)
    logoutTimerRef.current = setTimeout(() => {
      doLogout();
    }, INACTIVITY_TIMEOUT);
  }, [clearAllTimers, doLogout]);

  const handleStayLoggedIn = useCallback(() => {
    showWarningRef.current = false;
    setShowWarning(false);
    setCountdown(120);
    startTimers();
  }, [startTimers]);

  // Timesheet inactivity auto-stop (2h without navigation/text/upload)
  const tsTimerRef = useRef(null);
  const tsLastActivityRef = useRef(Date.now());
  const tsStoppedRef = useRef(false);

  const resetTsTimer = useCallback(() => {
    tsLastActivityRef.current = Date.now();
    tsStoppedRef.current = false;
    clearTimeout(tsTimerRef.current);
    tsTimerRef.current = setTimeout(async () => {
      if (!tsStoppedRef.current) {
        tsStoppedRef.current = true;
        await stopAllRunningTimesheets(tsLastActivityRef.current);
      }
    }, TIMESHEET_INACTIVITY);
  }, []);

  // Setup event listeners ONCE — use ref to check warning state
  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    // Extended events for timesheet: also track input, navigation, file uploads
    const tsEvents = ["mousedown", "keydown", "scroll", "touchstart", "input", "change", "click"];

    const handleActivity = () => {
      // Only reset if warning is NOT showing
      if (!showWarningRef.current) {
        startTimers();
      }
    };

    const handleTsActivity = () => {
      resetTsTimer();
    };

    const handleBeforeUnload = () => {
      stopAllRunningTimesheets();
    };

    // Also detect visibility changes — if tab goes hidden for too long
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Check timesheet inactivity on return
        const tsElapsed = Date.now() - tsLastActivityRef.current;
        if (tsElapsed >= TIMESHEET_INACTIVITY && !tsStoppedRef.current) {
          tsStoppedRef.current = true;
          stopAllRunningTimesheets(tsLastActivityRef.current);
        } else if (!tsStoppedRef.current) {
          resetTsTimer();
        }

        if (!showWarningRef.current) {
          const elapsed = Date.now() - lastActivityRef.current;
          if (elapsed >= INACTIVITY_TIMEOUT) {
            doLogout();
          } else if (elapsed >= INACTIVITY_TIMEOUT - WARNING_BEFORE) {
            // Show warning with remaining time
            const remaining = Math.max(0, Math.ceil((INACTIVITY_TIMEOUT - elapsed) / 1000));
            showWarningRef.current = true;
            setShowWarning(true);
            setCountdown(remaining);
            clearAllTimers();

            countdownRef.current = setInterval(() => {
              setCountdown(prev => {
                if (prev <= 1) {
                  clearInterval(countdownRef.current);
                  doLogout();
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          } else {
            startTimers();
          }
        }
      }
    };

    events.forEach(e => document.addEventListener(e, handleActivity, true));
    tsEvents.forEach(e => document.addEventListener(e, handleTsActivity, true));
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Start initial timers
    startTimers();
    resetTsTimer();

    return () => {
      events.forEach(e => document.removeEventListener(e, handleActivity, true));
      tsEvents.forEach(e => document.removeEventListener(e, handleTsActivity, true));
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearAllTimers();
      clearTimeout(tsTimerRef.current);
    };
  }, []); // Empty deps — runs once

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-border text-center">
        <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Sessão expirando</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Por segurança, você será desconectado por inatividade em:
        </p>
        <div className="text-4xl font-bold text-amber-600 mb-6">
          {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={doLogout}>
            Sair agora
          </Button>
          <Button className="flex-1" onClick={handleStayLoggedIn}>
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}