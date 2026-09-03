import { useState, useRef, useMemo, memo } from "react";
import { useStatusConfig } from "@/lib/AppConfigContext";
import { AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { autoCompleteSubtasks } from "./subtaskAutoComplete";

// Statuses are dynamic — loaded from AppConfigContext

const KanbanCard = memo(function KanbanCard({ job, subtasks, onClick, today, isDragging, statusConfig }) {
  const sc = statusConfig[job.status] || statusConfig.pending_briefing || {};
  const isLate = job.delivery_date && job.delivery_date < today && job.status !== "completed";
  const completedSubs = subtasks.filter(s => s.is_completed).length;

  return (
    <div
      className={`bg-card border border-border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group ${isDragging ? "opacity-50 rotate-1" : ""}`}
      onClick={() => onClick(job)}
      draggable
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{job.number || "—"}</span>
        {isLate && <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
      </div>

      <p className="text-sm font-medium text-foreground leading-tight mb-1.5 group-hover:text-primary transition-colors line-clamp-2">
        {job.title}
      </p>

      <p className="text-xs text-muted-foreground mb-2 truncate">
        {job.client_name}{job.project_name ? ` · ${job.project_name}` : ""}
      </p>

      <div className="flex items-center justify-between">
         <div className="flex items-center gap-2">
           {job.post_date && (
             <div className={`flex items-center gap-1 text-[10px] font-medium ${isLate ? "text-destructive" : "text-muted-foreground"}`}>
               <Clock className="w-3 h-3" />
               {format(new Date(job.post_date + "T12:00:00"), "dd/MM")}
             </div>
           )}
           {subtasks.length > 0 && (
             <span className="text-[10px] text-muted-foreground">
               {completedSubs}/{subtasks.length} ✓
             </span>
           )}
         </div>
        {job.responsible_name && (
          <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[9px] font-bold">
            {job.responsible_name[0]?.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
});

export default function KanbanView({ jobs, subtasks, getSubtasksForJob, onSelectJob, onUpdateStatus, today }) {
  const { statusList, statusConfig: STATUS_CONFIG } = useStatusConfig();
  const STATUSES = statusList.map(s => s.key);
  const [draggedJob, setDraggedJob] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const scrollRef = useRef(null);
  const isDraggingScroll = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const autoScrollRef = useRef(null);

  function handleDragStart(job) {
    setDraggedJob(job);
  }

  function handleDragOver(e, status) {
    e.preventDefault();
    setDragOverColumn(status);
    
    // Auto-scroll horizontalmente quando próximo da borda
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      const rect = scrollContainer.getBoundingClientRect();
      const threshold = 100;
      
      // Limpar scroll anterior
      clearInterval(autoScrollRef.current);
      
      if (e.clientX < rect.left + threshold) {
        // Perto da borda esquerda
        autoScrollRef.current = setInterval(() => {
          scrollContainer.scrollLeft -= 8;
        }, 16);
      } else if (e.clientX > rect.right - threshold) {
        // Perto da borda direita
        autoScrollRef.current = setInterval(() => {
          scrollContainer.scrollLeft += 8;
        }, 16);
      }
    }
  }

  async function handleDrop(e, status) {
    e.preventDefault();
    if (draggedJob && draggedJob.status !== status) {
      onUpdateStatus(draggedJob.id, status);
      const jobSubs = getSubtasksForJob(draggedJob.id);
      const statusOrder = statusList.filter(s => s.key !== "cancelled").map(s => s.key);

      // Auto-complete/reopen subtasks based on new status (handles both forward and backward moves)
      await autoCompleteSubtasks(status, jobSubs, base44, statusOrder);
    }
    clearInterval(autoScrollRef.current);
    setDraggedJob(null);
    setDragOverColumn(null);
  }

  const filteredJobs = jobs;

  // Drag-to-scroll
  function onMouseDown(e) {
    if (e.target.closest("[draggable]")) return;
    isDraggingScroll.current = true;
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = "grabbing";
  }
  function onMouseMove(e) {
    if (!isDraggingScroll.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    scrollRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  }
  function onMouseUp() {
    isDraggingScroll.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = "grab";
  }

  return (
    <div className="flex flex-col h-full">
      {/* Board */}
      <div
        ref={scrollRef}
        className="flex gap-4 p-4 overflow-x-auto flex-1 select-none"
        style={{ cursor: "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {statusList.map(({ key: status }) => {
          const sc = STATUS_CONFIG[status] || {};
          const columnJobs = filteredJobs
            .filter(j => j.status === status)
            .sort((a, b) => {
              const da = a.post_date || "9999-99-99";
              const db = b.post_date || "9999-99-99";
              return da.localeCompare(db);
            });
          const isOver = dragOverColumn === status;

          return (
            <div
              key={status}
              className={`flex-shrink-0 w-72 flex flex-col rounded-xl transition-all ${isOver ? "bg-primary/5 ring-2 ring-primary/30" : "bg-muted/40"}`}
              onDragOver={e => handleDragOver(e, status)}
              onDrop={e => handleDrop(e, status)}
            >
              <div className="px-3 py-3 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide truncate">
                  {sc.label}
                </span>
                <span className="ml-auto text-xs font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                  {columnJobs.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2 min-h-[100px]">
                {columnJobs.map(job => (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={() => handleDragStart(job)}
                    onDragEnd={() => { setDraggedJob(null); setDragOverColumn(null); }}
                  >
                    <KanbanCard
                      job={job}
                      subtasks={getSubtasksForJob(job.id)}
                      onClick={onSelectJob}
                      today={today}
                      isDragging={draggedJob?.id === job.id}
                      statusConfig={STATUS_CONFIG}
                    />
                  </div>
                ))}
                {columnJobs.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground opacity-60">
                    Arraste jobs para cá
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}