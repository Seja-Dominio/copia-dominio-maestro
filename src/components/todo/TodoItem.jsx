import { useState, useRef, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { todayStr as getTodayStr, formatManaus } from "@/lib/dateUtils";
import { Check, Circle, CalendarDays, Trash2, Send, ArrowUp } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import ConfirmDeleteTaskSheet from "./ConfirmDeleteTaskSheet";
import TimeScrollPicker from "./TimeScrollPicker";
import MiniTaskChecklist from "./MiniTaskChecklist";

export default function TodoItem({ task, onToggle, onSetDate, onDelete, onSetPriority, isSentByMe, onChecklistChange }) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedTime, setSelectedTime] = useState(task.due_time || null);
  const clickTimerRef = useRef(null);
  const clickCountRef = useRef(0);
  const calBtnRef = useRef(null);
  const calRef = useRef(null);

  // Close on outside click + auto-focus + lock body scroll
  useEffect(() => {
    if (!showDatePicker) return;
    calRef.current?.focus();
    document.body.style.overflow = "hidden";
    const handler = (e) => {
      if (calRef.current && !calRef.current.contains(e.target) && !calBtnRef.current?.contains(e.target)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("mousedown", handler);
    };
  }, [showDatePicker]);

  const createdLabel = task.created_date
    ? formatManaus(task.created_date, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", " ·")
    : "";

  const isOverdue = task.due_date && !task.is_completed && new Date(task.due_date + "T23:59:59") < new Date();
  const isFromAdmin = task.sender_id && task.sender_access_level === "admin" && !task.is_completed;
  const isFromOther = task.sender_id && task.sender_id !== task.collaborator_id;

  // Auto-priority: tasks with due_date set to today (or past) become priority 1 (red) visually
  const todayStr = getTodayStr();
  const isDueToday = task.due_date && !task.is_completed && task.due_date <= todayStr;
  const basePriority = task.priority || 0;
  const priority = (!task.is_completed && isDueToday && basePriority < 1) ? 1 : basePriority;

  // Handle multi-click on text area: double = red(1), triple = black(2)
  const handleTextClick = useCallback((e) => {
    if (!onSetPriority) return;
    e.preventDefault();
    e.stopPropagation();
    clickCountRef.current += 1;
    
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    
    clickTimerRef.current = setTimeout(() => {
      const clicks = clickCountRef.current;
      clickCountRef.current = 0;
      
      if (clicks >= 3) {
        // Triple click → urgente (preto) ou remove se já é urgente
        onSetPriority(basePriority === 2 ? 0 : 2);
      } else if (clicks === 2) {
        // Double click → alta (vermelho) ou remove se já é alta
        onSetPriority(basePriority === 1 ? 0 : 1);
      }
    }, 400);
  }, [basePriority, onSetPriority]);

  // Styles based on priority
  const getBgClass = () => {
    if (task.is_completed) return "";
    if (priority === 2) return "bg-gray-900 dark:bg-gray-950 border border-gray-700";
    if (priority === 1) return "bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800";
    if (isFromAdmin) return "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50";
    return "";
  };

  const getTextClass = () => {
    if (task.is_completed) return "line-through text-muted-foreground";
    if (priority === 2) return "text-white font-semibold";
    if (priority === 1) return "text-red-700 dark:text-red-400 font-semibold";
    return "text-foreground";
  };

  const getMetaClass = () => {
    if (priority === 2) return "text-gray-400";
    return "text-muted-foreground";
  };

  return (
    <div className={`group relative flex items-start gap-2 px-2 py-1.5 rounded-lg transition-colors ${task.is_completed ? "opacity-60" : ""} ${!task.is_completed && priority !== 2 ? "hover:bg-muted/40" : ""} ${getBgClass()}`}>
      {/* Check / Circle */}
      <button
        onClick={onToggle || undefined}
        disabled={!onToggle}
        className={`mt-0.5 flex-shrink-0 no-touch-min w-5 h-5 flex items-center justify-center ${!onToggle ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {task.is_completed ? (
          <Check className="w-4 h-4 text-green-500" />
        ) : (
          <Circle className={`w-4 h-4 transition-colors ${priority === 2 ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-primary"}`} />
        )}
      </button>

      {/* Content — click area for priority */}
      <div className="flex-1 min-w-0 select-none cursor-pointer" onClick={handleTextClick}>
        <div className="flex items-center gap-1">
          {priority > 0 && !task.is_completed && (
            <ArrowUp className={`w-3 h-3 flex-shrink-0 ${priority === 2 ? "text-white" : "text-red-600 dark:text-red-400"}`} />
          )}
          <p className={`text-xs leading-snug ${getTextClass()}`}>
            {task.title}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[9px] ${getMetaClass()}`}>{createdLabel}</span>
          {isSentByMe && (
            <span className="text-[9px] font-semibold flex items-center gap-0.5 text-orange-600 dark:text-orange-400">
              <Send className="w-2.5 h-2.5" />
              → {task.collaborator_name}
            </span>
          )}
          {!isSentByMe && isFromOther && (
            <span className={`text-[9px] font-semibold flex items-center gap-0.5 ${isFromAdmin ? (priority === 2 ? "text-gray-300" : "text-red-600 dark:text-red-400") : "text-primary"}`}>
              <Send className="w-2.5 h-2.5" />
              {task.sender_name}
            </span>
          )}
          {task.due_date && (
            <span className={`text-[9px] font-medium flex items-center gap-0.5 ${isOverdue ? "text-destructive" : (priority === 2 ? "text-blue-300" : "text-primary")}`}>
              <CalendarDays className="w-2.5 h-2.5" />
              {format(new Date(task.due_date + "T12:00:00"), "dd/MM")}
              {task.due_time && <span> {task.due_time}</span>}
            </span>
          )}
          {task.priority_changed_by_name && priority > 0 && !task.is_completed && (
            <span className={`text-[9px] flex items-center gap-0.5 ${priority === 2 ? "text-gray-400" : "text-orange-600 dark:text-orange-400"}`}>
              ⚡ {task.priority_changed_by_name}
            </span>
          )}
        </div>
        {!task.is_completed && (
          <MiniTaskChecklist
            checklist={task.checklist || []}
            onChange={onChecklistChange}
            readOnly={!onChecklistChange}
          />
        )}
      </div>

      {/* Date picker toggle */}
      {!task.is_completed && (onSetDate || onDelete) && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onSetDate && (
            <button
              ref={calBtnRef}
              onClick={() => setShowDatePicker(v => !v)}
              className={`no-touch-min w-6 h-6 flex items-center justify-center ${priority === 2 ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-primary"}`}
              title="Definir prazo"
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className={`no-touch-min w-6 h-6 flex items-center justify-center ${priority === 2 ? "text-gray-400 hover:text-red-400" : "text-muted-foreground hover:text-destructive"}`}
              title="Remover"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {task.is_completed && onDelete && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-muted-foreground hover:text-destructive no-touch-min w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          title="Remover"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      {/* Calendar overlay */}
      {showDatePicker && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/20" onClick={() => setShowDatePicker(false)} />
          <div
            ref={calRef}
            className="fixed z-[61] bg-card border border-border rounded-xl shadow-2xl flex flex-col"
            style={{
              left: "50%",
              transform: "translateX(-50%)",
              top: "calc(56px + env(safe-area-inset-top, 0px) + 8px)",
              maxHeight: "calc(100vh - 80px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))",
              width: "min(360px, calc(100vw - 24px))",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setShowDatePicker(false);
              }
            }}
            tabIndex={-1}
          >
            <div className="overflow-y-auto flex-1 min-h-0 flex flex-col items-center px-3 pt-2">
              <Calendar
                mode="single"
                selected={task.due_date ? new Date(task.due_date + "T12:00:00") : undefined}
                onSelect={(date) => {
                  if (date) {
                    const iso = format(date, "yyyy-MM-dd");
                    onSetDate(iso, selectedTime || null);
                  }
                }}
                locale={ptBR}
              />

              <TimeScrollPicker
                value={selectedTime}
                onChange={(time) => {
                  setSelectedTime(time);
                  if (task.due_date) {
                    onSetDate(task.due_date, time);
                  }
                }}
                hideRemove
              />
            </div>

            {/* Footer: 3 buttons side by side */}
            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-border px-3 pb-2 flex-shrink-0 w-full">
              <button
                onClick={() => { onSetDate(null, null); setSelectedTime(null); setShowDatePicker(false); }}
                className={`text-[10px] py-1.5 rounded-md no-touch-min font-medium ${task.due_date ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground/40 cursor-default"}`}
                disabled={!task.due_date}
              >
                Remover prazo
              </button>
              <button
                onClick={() => { setSelectedTime(null); if (task.due_date) onSetDate(task.due_date, null); }}
                className={`text-[10px] py-1.5 rounded-md no-touch-min font-medium ${selectedTime ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground/40 cursor-default"}`}
                disabled={!selectedTime}
              >
                Remover horário
              </button>
              <button
                onClick={() => setShowDatePicker(false)}
                className="text-[10px] py-1.5 rounded-md no-touch-min font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation drawer */}
      <ConfirmDeleteTaskSheet
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          onDelete();
        }}
        taskTitle={task.title}
      />
    </div>
  );
}