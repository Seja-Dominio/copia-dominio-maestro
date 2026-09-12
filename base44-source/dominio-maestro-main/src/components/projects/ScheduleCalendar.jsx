import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Download, ChevronLeft, ChevronRight, Briefcase, Loader2, Ban, GripVertical, StickyNote, CheckCircle2, Link2 } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import BulkJobConfirmModal from "@/components/jobs/BulkJobConfirmModal";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  format, startOfMonth, endOfMonth,
  addMonths, subMonths
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { base44 } from "@/api/base44Client";
import { fireJobCreatedNotifications } from "@/lib/jobNotifications";
import SpellCheckTextarea from "@/components/SpellCheckTextarea";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Logo vertical (símbolo D) — usada como marca d'água e nas células vazias
const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69b0ac7e08d578f9756170a0/78bf96942_VERTICALSEMFUNDO.png";
// Logo horizontal completa — usada no header do PDF
const LOGO_HORIZONTAL_URL = "https://media.base44.com/images/public/69b0ac7e08d578f9756170a0/e61b9b073_a4.png";

const FORMAT_OPTIONS = [
  { value: "card",           label: "Card",             bg: "#4ade80", text: "#166534" },
  { value: "reels",          label: "Reels",            bg: "#60a5fa", text: "#1e3a8a" },
  { value: "video_trafego",  label: "Vídeo de Tráfego", bg: "#38bdf8", text: "#0c4a6e" },
  { value: "card_trafego",   label: "Card de Tráfego",  bg: "#34d399", text: "#064e3b" },
  { value: "foto",           label: "Foto",             bg: "#fbbf24", text: "#78350f" },
  { value: "vt",             label: "VT",               bg: "#fb923c", text: "#7c2d12" },
  { value: "stories",        label: "Stories",          bg: "#a78bfa", text: "#3b0764" },
];

// Retorna a cor de fundo baseada no primeiro formato selecionado
function getBgFromFormats(formats) {
  if (!formats || formats.length === 0) return "#f8fafc";
  const opt = FORMAT_OPTIONS.find(o => o.value === formats[0]);
  return opt ? opt.bg + "55" : "#f8fafc"; // 55 = ~33% opacity hex
}

// Salva schedule no Project entity como campo JSON
async function persistSchedule(projectId, schedule) {
  await base44.entities.Project.update(projectId, { schedule_data: schedule });
}

function PostCard({ post, onUpdate, onCancel, onCreateJob, hasJob, compact, jobData, dragHandleProps, onComplete }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text || "");
  const [editingUrl, setEditingUrl] = useState(false);
  const [editUrl, setEditUrl] = useState(post.reference_url || "");
  const inputRef = useRef(null);
  const urlInputRef = useRef(null);
  const isCancelled = post.cancelled || jobData?.status === "cancelled";
  const isObservation = post.is_observation;
  const isCompleted = post.is_completed;
  const opt = FORMAT_OPTIONS.find(o => o.value === post.formats?.[0]);
  const bgColor = isObservation
    ? (isCompleted ? "#f1f5f9" : "#fef3c7")
    : (isCancelled ? "#f1f5f9" : (opt ? opt.bg + "22" : "#f1f5f9"));
  const borderColor = isObservation
    ? (isCompleted ? "#d1d5db" : "#f59e0b")
    : (isCancelled ? "#d1d5db" : (opt ? opt.bg : "#e2e8f0"));
  const textColor = isObservation
    ? (isCompleted ? "#9ca3af" : "#92400e")
    : (isCancelled ? "#9ca3af" : (opt ? opt.text : "#374151"));

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => {
    if (editingUrl && urlInputRef.current) urlInputRef.current.focus();
  }, [editingUrl]);

  function commitUrl() {
    const trimmed = editUrl.trim();
    if (trimmed !== (post.reference_url || "")) {
      onUpdate({ ...post, reference_url: trimmed || undefined });
      // Sync to Job entity if post is backed by a job
      if (post.job_id) {
        base44.entities.Job.update(post.job_id, { reference_url: trimmed || "" });
      }
    }
    setEditingUrl(false);
  }

  function commitEdit() {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== post.text) {
      onUpdate({ ...post, text: trimmed });
      // If it's a job-backed post, also update the Job title
      if (post.job_id) {
        const jobId = post.job_id;
        const formatLabel = FORMAT_OPTIONS.find(o => o.value === post.formats?.[0])?.label || "";
        const newTitle = `${formatLabel} — ${trimmed}`;
        base44.entities.Job.update(jobId, { title: newTitle });
      }
    }
    setEditing(false);
  }

  function handleCancel(e) {
    e.stopPropagation();
    if (window.confirm(`Cancelar "${post.text || "este post"}"? O job associado também será cancelado.`)) {
      onCancel();
    }
  }

  return (
    <div
      className={`rounded-md p-1.5 mb-1 relative group border-l-[3px] ${isCancelled ? "opacity-50" : ""}`}
      style={{ backgroundColor: bgColor, borderLeftColor: borderColor }}
      data-reference-url={(!isCancelled && post.reference_url) || undefined}
    >
      {/* Drag handle */}
      {!isCancelled && dragHandleProps && (
        <div {...dragHandleProps} className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-60 transition-opacity cursor-grab active:cursor-grabbing" title="Arrastar">
          <GripVertical className="w-3 h-3 text-gray-400" />
        </div>
      )}
      {/* Content */}
      <div className="flex flex-col items-center gap-0.5 w-full">
        {isObservation ? (
          <span className="px-2 py-[3px] rounded-full text-[7px] font-black uppercase tracking-wide leading-tight whitespace-nowrap inline-flex items-center justify-center gap-0.5"
            style={{ backgroundColor: isCompleted ? "#9ca3af" : "#f59e0b", color: "#fff" }}>
            <StickyNote className="w-2 h-2" /> OBS
          </span>
        ) : (
          (post.formats || []).slice(0, 1).map(f => {
            const o = FORMAT_OPTIONS.find(x => x.value === f);
            return (
              <span
                key={f}
                className="px-2.5 rounded-full text-[7px] font-black uppercase tracking-wide whitespace-nowrap inline-flex items-center justify-center text-center"
                style={{ backgroundColor: isCancelled ? "#9ca3af" : (o?.bg || "#888"), color: "#fff", lineHeight: "1", paddingTop: "4px", paddingBottom: "4px" }}
              >
                {o?.label || f}
              </span>
            );
          })
        )}
        {editing && !isCancelled && !isCompleted ? (
          <input
            ref={inputRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } if (e.key === "Escape") { setEditText(post.text || ""); setEditing(false); } }}
            onClick={e => e.stopPropagation()}
            className="text-[9px] leading-tight font-semibold text-center w-full bg-white/80 border border-gray-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
            style={{ color: textColor, minHeight: "auto" }}
          />
        ) : post.text ? (
          <p
            className={`text-[9px] leading-tight font-semibold break-words text-center w-full cursor-text hover:bg-white/40 rounded px-0.5 transition-colors ${isCompleted ? "line-through" : ""}`}
            style={{ color: textColor, wordBreak: "break-word", overflowWrap: "break-word" }}
            onClick={e => { if (!isCancelled && !isCompleted) { e.stopPropagation(); setEditText(post.text); setEditing(true); } }}
            title={isObservation ? "Observação" : "Clique para editar"}
          >
            {isCancelled ? <s>{post.text}</s> : post.text}
          </p>
        ) : null}
        {/* Reference URL */}
        {!isObservation && !isCancelled && (
          editingUrl ? (
            <input
              ref={urlInputRef}
              value={editUrl}
              onChange={e => setEditUrl(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitUrl(); } if (e.key === "Escape") { setEditUrl(post.reference_url || ""); setEditingUrl(false); } }}
              onClick={e => e.stopPropagation()}
              placeholder="https://..."
              className="text-[8px] w-full bg-white/80 border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 text-blue-600"
              style={{ minHeight: "auto" }}
            />
          ) : post.reference_url ? (
            <a
              href={post.reference_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center justify-center gap-0.5 text-[8px] text-red-600 font-bold hover:text-red-800 hover:underline truncate w-full mt-0.5"
              title={post.reference_url}
            >
              <Link2 className="w-2.5 h-2.5 flex-shrink-0" /> 🔗 Referência
            </a>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setEditUrl(""); setEditingUrl(true); }}
              className="w-full text-[7px] text-gray-300 hover:text-blue-400 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
            >
              <Link2 className="w-2 h-2" /> + Link
            </button>
          )
        )}
        {/* Edit existing URL on click */}
        {post.reference_url && !editingUrl && !isCancelled && !isObservation && (
          <button
            onClick={e => { e.stopPropagation(); setEditUrl(post.reference_url); setEditingUrl(true); }}
            className="absolute top-0.5 right-4 opacity-0 group-hover:opacity-60 transition-opacity"
            title="Editar link"
          >
            <Link2 className="w-2.5 h-2.5 text-blue-400" />
          </button>
        )}
      </div>
      {/* Bottom actions */}
      {isObservation ? (
        <div data-job-status className="mt-0.5">
          {!isCompleted ? (
            <button
              onClick={e => { e.stopPropagation(); onComplete?.(); }}
              className="w-full text-[8px] text-amber-600 hover:text-green-700 hover:bg-green-50 rounded py-0 flex items-center justify-center gap-0.5 transition-colors"
            >
              <CheckCircle2 className="w-2 h-2" /> Concluir
            </button>
          ) : (
            <div className="flex items-center justify-center gap-0.5 text-[8px] font-semibold text-green-600">
              <CheckCircle2 className="w-2 h-2" /> Concluído
            </div>
          )}
        </div>
      ) : !isCancelled ? (
        <div data-job-status className="mt-0.5">
          {hasJob ? (
            <div className="flex items-center justify-center gap-0.5 text-[8px] font-semibold text-green-700">
              <Briefcase className="w-2 h-2" /> Job criado
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); onCreateJob(); }}
              className="w-full text-[8px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded py-0 flex items-center justify-center gap-0.5 transition-colors"
            >
              <Briefcase className="w-2 h-2" /> Criar Job
            </button>
          )}
        </div>
      ) : (
        <div className="mt-0.5 flex items-center gap-0.5 text-[8px] font-semibold text-gray-400">
          <Ban className="w-2 h-2" /> Cancelado
        </div>
      )}
      {/* Cancel button instead of delete */}
      {!isCancelled && (
        <button
          onClick={handleCancel}
          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity w-2.5 h-2.5 bg-gray-400 text-white rounded-full flex items-center justify-center no-touch-min"
          title="Cancelar"
        >
          <Ban className="w-1.5 h-1.5" />
        </button>
      )}
    </div>
  );
}

function AddPostForm({ onAdd, onCancel, position, containerBounds }) {
  const [mode, setMode] = useState("post"); // "post" or "observation"
  const [text, setText] = useState("");
  const [formats, setFormats] = useState([]);
  const [referenceUrl, setReferenceUrl] = useState("");
  const [observation, setObservation] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (formRef.current && !formRef.current.contains(e.target)) {
        onCancel();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onCancel]);

  function toggleFormat(f) {
    setFormats(prev => prev.includes(f) ? [] : [f]);
    setError("");
  }

  function submit() {
    if (mode === "observation") {
      if (!observation.trim()) {
        setError("Adicione o texto da observação.");
        return;
      }
      onAdd({ text: observation.trim(), formats: [], id: Date.now().toString(), is_observation: true });
      return;
    }
    if (formats.length === 0 && !text.trim()) {
      setError("Selecione um formato e adicione um título.");
      return;
    }
    if (formats.length === 0) {
      setError("Selecione pelo menos um formato.");
      return;
    }
    if (!text.trim()) {
      setError("Adicione um título para a postagem.");
      return;
    }
    onAdd({ text: text.trim(), formats, id: Date.now().toString(), reference_url: referenceUrl.trim() || undefined });
  }

  const canSubmit = mode === "observation" ? observation.trim().length > 0 : (formats.length > 0 && text.trim().length > 0);

  const FORM_W = 240;
  const PADDING = 8;

  const bounds = containerBounds || { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };

  useEffect(() => {
    if (!formRef.current) return;
    const rect = formRef.current.getBoundingClientRect();
    let top = rect.top;
    let left = rect.left;
    if (left + rect.width > bounds.right - PADDING) left = bounds.right - rect.width - PADDING;
    if (left < bounds.left + PADDING) left = bounds.left + PADDING;
    if (top + rect.height > bounds.bottom - PADDING) top = bounds.bottom - rect.height - PADDING;
    if (top < bounds.top + PADDING) top = bounds.top + PADDING;
    if (Math.abs(top - rect.top) > 1 || Math.abs(left - rect.left) > 1) {
      formRef.current.style.top = `${top}px`;
      formRef.current.style.left = `${left}px`;
    }
  });

  let initialLeft = position ? position.left + ((position.right || position.left) - position.left) / 2 - FORM_W / 2 : bounds.left + 100;
  if (initialLeft + FORM_W > bounds.right - PADDING) initialLeft = bounds.right - FORM_W - PADDING;
  if (initialLeft < bounds.left + PADDING) initialLeft = bounds.left + PADDING;
  let initialTop = (position?.bottom ?? bounds.top + 100) + 4;
  if (initialTop + 320 > bounds.bottom - PADDING) initialTop = (position?.top ?? bounds.top + 100) - 320 - 4;
  if (initialTop < bounds.top + PADDING) initialTop = bounds.top + PADDING;

  return (
    <div
      ref={formRef}
      className="fixed z-[10001] bg-white border border-gray-200 rounded-xl shadow-2xl p-3"
      style={{ top: initialTop, left: initialLeft, width: FORM_W, maxHeight: `calc(100vh - ${PADDING * 2}px)`, overflowY: 'auto' }}
    >
      {/* Mode toggle */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={() => { setMode("post"); setError(""); }}
          className={`flex-1 text-[10px] font-bold py-1 rounded-lg transition-colors ${mode === "post" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
        >
          Postagem
        </button>
        <button
          onClick={() => { setMode("observation"); setError(""); }}
          className={`flex-1 text-[10px] font-bold py-1 rounded-lg transition-colors ${mode === "observation" ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
        >
          Observação
        </button>
      </div>

      {mode === "post" ? (
        <>
          <p className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
            Formato <span className="text-red-400">*</span>
          </p>
          <div className="flex flex-wrap gap-1 mb-3">
            {FORMAT_OPTIONS.map(f => (
              <button
                key={f.value}
                onClick={() => toggleFormat(f.value)}
                className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wide transition-all border"
                style={{
                  backgroundColor: formats.includes(f.value) ? f.bg : "transparent",
                  borderColor: f.bg,
                  color: formats.includes(f.value) ? "#fff" : f.text,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p className="text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            Título <span className="text-red-400">*</span>
          </p>
          <SpellCheckTextarea
            rows={2}
            placeholder="Título da postagem..."
            value={text}
            onChange={e => { setText(e.target.value); setError(""); }}
            className={`bg-gray-50 ${
              error && !text.trim() ? "border-red-300 focus:ring-red-300" : "border-gray-200 focus:ring-blue-400"
            }`}
          />

          <p className="text-[10px] font-semibold text-gray-500 mb-1 mt-2 uppercase tracking-wide flex items-center gap-1">
            <Link2 className="w-3 h-3" /> Link de referência
          </p>
          <input
            type="url"
            placeholder="https://www.instagram.com/reel/..."
            value={referenceUrl}
            onChange={e => setReferenceUrl(e.target.value)}
            className="w-full text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-400 text-blue-600 placeholder:text-gray-300"
            style={{ minHeight: "auto" }}
          />
        </>
      ) : (
        <>
          <p className="text-[10px] font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            Observação
          </p>
          <SpellCheckTextarea
            rows={3}
            placeholder="Ex: Cliente viajando, sem gravações essa semana..."
            value={observation}
            onChange={e => { setObservation(e.target.value); setError(""); }}
            className="bg-amber-50 border-amber-200 focus:ring-amber-400"
          />
        </>
      )}

      {error && (
        <p className="text-[10px] text-red-500 mt-1 font-semibold">{error}</p>
      )}

      <div className="flex gap-1.5 mt-2">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`flex-1 text-white text-xs py-1.5 rounded-lg font-semibold transition-colors ${
            canSubmit ? (mode === "observation" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700") : "bg-gray-300 cursor-not-allowed"
          }`}
        >
          Adicionar
        </button>
        <button
          onClick={onCancel}
          className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs py-1.5 rounded-lg font-semibold transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function DayCell({ date, posts, onAddPost, onUpdatePost, onCancelPost, onCompletePost, onCreateJobForPost, isCurrentMonth, onOpenForm, activeFormDay, compact, jobsByPostId }) {
  const cellRef = useRef(null);
  const dayStr = format(date, "yyyy-MM-dd");
  const isToday = format(new Date(), "yyyy-MM-dd") === dayStr;
  const showForm = activeFormDay === dayStr;
  const isEmpty = posts.length === 0;
  const visiblePosts = posts.filter(p => !p.cancelled);

  function handleAddClick() {
    if (!isCurrentMonth) return;
    onOpenForm(dayStr, cellRef.current);
  }

  return (
    <div
      ref={cellRef}
      data-empty-cell={isEmpty ? "true" : undefined}
      className={`border-r border-b border-gray-100 p-2 relative flex flex-col ${
        !isCurrentMonth ? "bg-gray-50/50" : isToday ? "bg-blue-50/40" : "bg-white"
      }`}
      style={{ minHeight: "120px" }}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-0.5">
        <span className={`text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full ${
          isToday
            ? "bg-blue-600 text-white"
            : !isCurrentMonth
              ? "text-gray-300"
              : "text-gray-500"
        }`}>
          {format(date, "d")}
        </span>
      </div>

      {/* Posts — droppable zone */}
      <Droppable droppableId={dayStr}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            data-day-scroll="true"
            className={`flex-1 overflow-y-auto rounded transition-colors ${snapshot.isDraggingOver ? "bg-blue-50/60" : ""}`}
            style={{ maxHeight: "120px", minHeight: "20px" }}
          >
            {visiblePosts.map((post, idx) => {
              const originalIdx = posts.indexOf(post);
              return (
                <Draggable key={post.id} draggableId={post.id} index={idx}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      style={{ ...dragProvided.draggableProps.style, opacity: dragSnapshot.isDragging ? 0.85 : 1 }}
                    >
                      <PostCard
                        post={post}
                        onUpdate={updated => onUpdatePost(dayStr, originalIdx, updated)}
                        onCancel={() => onCancelPost(dayStr, originalIdx)}
                        onComplete={() => onCompletePost(dayStr, originalIdx)}
                        onCreateJob={() => onCreateJobForPost(dayStr, post)}
                        hasJob={!!post.job_id}
                        compact={compact}
                        jobData={jobsByPostId?.[post.id]}
                        dragHandleProps={dragProvided.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {/* Add button */}
      {isCurrentMonth && (
        <button
          onClick={handleAddClick}
          className="w-full mt-0.5 text-[8px] text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded py-0.5 flex items-center justify-center gap-0.5 transition-colors flex-shrink-0"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

export default function ScheduleCalendar({ project, onClose }) {
  const [currentDate, setCurrentDate] = useState(() => {
    // Use reference_month if available
    if (project.reference_month) {
      const [y, m] = project.reference_month.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [schedule, setSchedule] = useState({});
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [existingJobs, setExistingJobs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [allTemplatesList, setAllTemplatesList] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPosts, setBulkPosts] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [activeFormDay, setActiveFormDay] = useState(null);
  const [formPosition, setFormPosition] = useState(null);
  const [containerBounds, setContainerBounds] = useState(null);
  const [docLink1, setDocLink1] = useState("");
  const [docLink2, setDocLink2] = useState("");
  const [docLabel1, setDocLabel1] = useState("");
  const [docLabel2, setDocLabel2] = useState("");
  const calendarRef = useRef(null);
  const modalRef = useRef(null);

  // Multi-project: all projects from the same client
  const [clientProjects, setClientProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(project.id);

  // The active project object (from client projects list or fallback to the prop)
  const activeProject = clientProjects.find(p => p.id === activeProjectId) || project;

  function openForm(dayStr, cellEl) {
    if (cellEl) {
      const rect = cellEl.getBoundingClientRect();
      setFormPosition({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
    if (modalRef.current) {
      const mr = modalRef.current.getBoundingClientRect();
      setContainerBounds({ top: mr.top, bottom: mr.bottom, left: mr.left, right: mr.right });
    }
    setActiveFormDay(dayStr);
  }

  function closeForm() {
    setActiveFormDay(null);
    setFormPosition(null);
  }

  // Build a map of post_id -> job data for status sync
  const jobsByPostId = {};
  Object.values(schedule).flat().forEach(p => {
    if (p.job_id) {
      const j = existingJobs.find(job => job.id === p.job_id);
      if (j) jobsByPostId[p.id] = j;
    }
  });

  // Equipes do projeto ativo
  const projectTeams = activeProject.teams?.length ? activeProject.teams : (activeProject.team ? [activeProject.team] : []);

  // Inicializa selectedTeam com a primeira equipe ao carregar
  useEffect(() => {
    if (selectedTeam === "" && projectTeams.length > 0) {
      setSelectedTeam(projectTeams[0]);
    }
  }, [selectedTeam, projectTeams]);

  // Build merged schedule: draft posts from schedule_data + all jobs as source of truth
  function buildMergedSchedule(savedSchedule, jobs) {
    const typeMap = { feed_card: "card", reels: "reels", story: "stories", video: "vt", card_trafego: "card_trafego", video_trafego: "video_trafego", foto: "foto", promocao: "card" };
    
    // Start with only NON-job posts (drafts) from saved schedule
    const merged = {};
    Object.entries(savedSchedule).forEach(([dayStr, posts]) => {
      const drafts = posts.filter(p => !p.job_id && !p.job_created);
      if (drafts.length > 0) merged[dayStr] = [...drafts];
    });
    
    // Add every job with a post_date as a calendar entry (jobs are source of truth)
    jobs.forEach(job => {
      if (!job.post_date) return;
      const fmt = typeMap[job.content_type] || "card";
      const post = {
        id: `job-${job.id}`,
        job_id: job.id,
        text: job.title || "Job",
        formats: [fmt],
        job_created: true,
        cancelled: job.status === "cancelled",
        reference_url: job.reference_url,
      };
      if (!merged[job.post_date]) merged[job.post_date] = [];
      merged[job.post_date].push(post);
    });
    
    return merged;
  }

  // Load all projects from the same client
  useEffect(() => {
    if (!project.client_id) return;
    base44.entities.Project.filter({ client_id: project.client_id }, "-created_date", 100).then(projs => {
      setClientProjects(projs);
    });
  }, [project.client_id]);

  // Detect which project matches the current month and auto-switch
  useEffect(() => {
    if (clientProjects.length === 0) return;
    const monthStr = format(currentDate, "yyyy-MM");
    
    // Priority 1: match by reference_month field
    const matchedByRef = clientProjects.find(p => p.reference_month === monthStr);
    if (matchedByRef) {
      setActiveProjectId(matchedByRef.id);
      return;
    }
    
    // Priority 2: fallback to name-based matching
    const monthNames = {
      "01": "janeiro", "02": "fevereiro", "03": "março", "04": "abril",
      "05": "maio", "06": "junho", "07": "julho", "08": "agosto",
      "09": "setembro", "10": "outubro", "11": "novembro", "12": "dezembro",
    };
    const [yyyy, mm] = monthStr.split("-");
    const monthName = monthNames[mm] || "";
    const yearShort = yyyy.slice(2);
    
    const matched = clientProjects.find(p => {
      const name = (p.name || "").toLowerCase();
      return (name.includes(monthName) && (name.includes(yyyy) || name.includes(yearShort)));
    });
    if (matched) {
      setActiveProjectId(matched.id);
    }
  }, [currentDate, clientProjects]);

  // Carrega schedule salvo no projeto ativo + jobs existentes + templates da equipe
  useEffect(() => {
    async function load() {
      setLoadingSchedule(true);
      try {
        const [proj, jobs, allTpls] = await Promise.all([
          base44.entities.Project.filter({ id: activeProjectId }, "id", 1),
          base44.entities.Job.filter({ project_id: activeProjectId }, "-created_date", 200),
          base44.entities.JobTemplate.list("name", 200),
        ]);
        const savedSchedule = proj[0]?.schedule_data || {};
        setDocLink1(proj[0]?.doc_link_1 || "");
        setDocLink2(proj[0]?.doc_link_2 || "");
        setDocLabel1(proj[0]?.doc_label_1 || "");
        setDocLabel2(proj[0]?.doc_label_2 || "");
        
        const merged = buildMergedSchedule(savedSchedule, jobs);
        setSchedule(merged);
        setExistingJobs(jobs);
        setAllTemplatesList(allTpls);
        
        // Filtrar templates pelas equipes do projeto
        const teams = activeProject.teams?.length ? activeProject.teams : (activeProject.team ? [activeProject.team] : []);
        if (teams.length > 0) {
          const filtered = allTpls.filter(t => {
            const tTeams = t.teams?.length ? t.teams : (t.team ? [t.team] : []);
            return tTeams.some(tm => teams.some(pt => pt.toLowerCase().trim() === tm.toLowerCase().trim()));
          });
          setTemplates(filtered);
        } else {
          setTemplates(allTpls);
        }
      } catch {}
      setLoadingSchedule(false);
    }
    load();
  }, [activeProjectId]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);

  // Build weeks: pad first week with nulls so day-of-week aligns, show only current month days
  const firstDow = monthStart.getDay(); // 0=Sun
  const daysInMonth = monthEnd.getDate();
  const totalMonthDays = firstDow + daysInMonth;
  const totalWeeks = Math.ceil(totalMonthDays / 7);

  // Build array of 7*totalWeeks slots (null = empty cell)
  const calSlots = [];
  for (let i = 0; i < totalWeeks * 7; i++) {
    const dayNum = i - firstDow + 1;
    if (dayNum >= 1 && dayNum <= daysInMonth) {
      calSlots.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), dayNum));
    } else {
      calSlots.push(null);
    }
  }

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // Only persist draft posts (non-job) to schedule_data
  const saveSchedule = useCallback(async (newSchedule) => {
    const draftsOnly = {};
    Object.entries(newSchedule).forEach(([dayStr, posts]) => {
      const drafts = posts.filter(p => !p.job_id && !p.job_created);
      if (drafts.length > 0) draftsOnly[dayStr] = drafts;
    });
    await persistSchedule(activeProjectId, draftsOnly);
  }, [activeProjectId]);

  // Drag-and-drop: move post between days
  function handleDragEnd(result) {
    const { source, destination, draggableId } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;

    const srcDay = source.droppableId;
    const dstDay = destination.droppableId;

    // Find the post being moved
    const srcPosts = schedule[srcDay] || [];
    const visibleSrc = srcPosts.filter(p => !p.cancelled);
    const movedPost = visibleSrc[source.index];
    if (!movedPost) return;

    // Remove from source
    const newSrcPosts = srcPosts.filter(p => p.id !== movedPost.id);

    // Add to destination at correct position
    const dstPosts = srcDay === dstDay ? newSrcPosts : [...(schedule[dstDay] || [])];
    const visibleDst = dstPosts.filter(p => !p.cancelled);
    // Calculate insertion index in the full array
    const insertAfter = destination.index > 0 ? visibleDst[destination.index - 1] : null;
    const insertIdx = insertAfter ? dstPosts.indexOf(insertAfter) + 1 : 0;
    const newDstPosts = [...dstPosts];
    newDstPosts.splice(insertIdx, 0, movedPost);

    const newSchedule = { ...schedule, [srcDay]: newSrcPosts, [dstDay]: newDstPosts };
    setSchedule(newSchedule);
    saveSchedule(newSchedule);

    // If it's a job-backed post, update the job's post_date and shift subtask deadlines
    if (movedPost.job_id && srcDay !== dstDay) {
      const diffMs = new Date(dstDay + "T12:00:00") - new Date(srcDay + "T12:00:00");
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      base44.entities.Job.update(movedPost.job_id, { post_date: dstDay });
      setExistingJobs(prev => prev.map(j => j.id === movedPost.job_id ? { ...j, post_date: dstDay } : j));

      // Recalculate subtask deadlines based on days_before_post from the new post_date
      const newPostDate = new Date(dstDay + "T12:00:00");
      base44.entities.Subtask.filter({ job_id: movedPost.job_id }, "order", 50).then(subtasks => {
        subtasks.forEach(sub => {
          if (sub.days_before_post !== undefined && sub.days_before_post !== null) {
            const d = new Date(newPostDate);
            d.setDate(d.getDate() - Number(sub.days_before_post));
            const newDeadline = d.toISOString().split("T")[0];
            base44.entities.Subtask.update(sub.id, { deadline: newDeadline });
          } else if (sub.deadline) {
            // Fallback: shift by diff if no days_before_post defined
            const d = new Date(sub.deadline + "T12:00:00");
            d.setDate(d.getDate() + diffDays);
            const newDeadline = d.toISOString().split("T")[0];
            base44.entities.Subtask.update(sub.id, { deadline: newDeadline });
          }
        });
      });
    }
  }

  function addPost(dayStr, post) {
    setSchedule(prev => {
      const updated = { ...prev, [dayStr]: [...(prev[dayStr] || []), post] };
      saveSchedule(updated);
      return updated;
    });
  }

  function updatePost(dayStr, idx, updated) {
    setSchedule(prev => {
      const posts = [...(prev[dayStr] || [])];
      posts[idx] = updated;
      const newSched = { ...prev, [dayStr]: posts };
      saveSchedule(newSched);
      return newSched;
    });
    // Sync reference_url to existingJobs state so it stays in sync
    if (updated.job_id && updated.reference_url !== undefined) {
      setExistingJobs(prev => prev.map(j => j.id === updated.job_id ? { ...j, reference_url: updated.reference_url || "" } : j));
    }
  }

  function completePost(dayStr, idx) {
    setSchedule(prev => {
      const posts = [...(prev[dayStr] || [])];
      posts[idx] = { ...posts[idx], is_completed: !posts[idx].is_completed };
      const newSched = { ...prev, [dayStr]: posts };
      saveSchedule(newSched);
      return newSched;
    });
  }

  function cancelPost(dayStr, idx) {
    const post = schedule[dayStr]?.[idx];
    if (!post) return;
    
    if (post.job_id) {
      // Cancel the actual job — schedule will reflect via job data
      const associatedJob = existingJobs.find(j => j.id === post.job_id);
      if (associatedJob && associatedJob.status !== "cancelled") {
        base44.entities.Job.update(associatedJob.id, { status: "cancelled" });
        const updatedJobs = existingJobs.map(j => j.id === associatedJob.id ? { ...j, status: "cancelled" } : j);
        setExistingJobs(updatedJobs);
        // Rebuild schedule from updated jobs
        setSchedule(prev => {
          const draftsOnly = {};
          Object.entries(prev).forEach(([d, posts]) => {
            const drafts = posts.filter(p => !p.job_id && !p.job_created);
            if (drafts.length > 0) draftsOnly[d] = drafts;
          });
          return buildMergedSchedule(draftsOnly, updatedJobs);
        });
      }
    } else {
      // Cancel a draft post
      setSchedule(prev => {
        const posts = [...(prev[dayStr] || [])];
        posts[idx] = { ...posts[idx], cancelled: true };
        const newSched = { ...prev, [dayStr]: posts };
        saveSchedule(newSched);
        return newSched;
      });
    }
  }

  const contentTypeMap = { card: "feed_card", reels: "reels", video_trafego: "video_trafego", card_trafego: "card_trafego", stories: "story", foto: "foto", vt: "video" };

  // Encontra template que melhor casa com o formato do post
  function findTemplateForPost(post) {
    if (templates.length === 0) return null;
    const fmt = post.formats?.[0];
    if (!fmt) return null;

    const mappedType = contentTypeMap[fmt];

    // Mapeamento direto de formato → palavras-chave no nome do template
    const nameKeywords = {
      card:           ["card", "estático", "estatico"],
      reels:          ["reels", "reel"],
      video_trafego:  ["vídeo tráfego", "video tráfego", "video trafego", "criativo vídeo tráfego", "criativo video trafego"],
      card_trafego:   ["estático tráfego", "estatico trafego", "criativo estático tráfego", "criativo estatico trafego"],
      foto:           ["foto", "photo"],
      stories:        ["stories", "story", "storie"],
      vt:             ["vt"],
    };

    const allFmts = [fmt, mappedType].filter(Boolean);
    const keywords = nameKeywords[fmt] || [];

    // 1. Match por content_types array do template
    let match = templates.find(t =>
      t.content_types?.some(ct => allFmts.includes(ct))
    );
    if (match) return match;

    // 2. Match por content_type singular
    match = templates.find(t => allFmts.includes(t.content_type));
    if (match) return match;

    // 3. Match por palavras-chave no nome do template
    if (keywords.length > 0) {
      match = templates.find(t => {
        const name = (t.name || "").toLowerCase();
        return keywords.some(kw => name.includes(kw));
      });
      if (match) return match;
    }

    return null;
  }

  async function createJobFromPost(dayStr, post) {
    const formatLabel = FORMAT_OPTIONS.find(o => o.value === post.formats?.[0])?.label || post.formats?.[0] || "Post";
    const content_type = contentTypeMap[post.formats?.[0]] || "outros";
    const template = findTemplateForPost(post);
    const title = template?.job_title || (post.text ? `${formatLabel} — ${post.text}` : formatLabel);

    const created = await base44.entities.Job.create({
      title,
      project_id: activeProject.id,
      project_name: activeProject.name,
      client_id: activeProject.client_id,
      client_name: activeProject.client_name,
      post_date: dayStr,
      content_type,
      status: "pending_briefing",
      template_id: template?.id || undefined,
      score: template?.score || 0,
    });

    // Criar subtasks do template
    if (template?.subtasks?.length) {
       const postDate = new Date(dayStr + "T12:00:00");
       const sortedSubtasks = [...template.subtasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
       const createdSubs = await Promise.all(sortedSubtasks.map((s, i) => {
         let deadline;
         if (s.days_before_post !== undefined && postDate) {
           const d = new Date(postDate);
           d.setDate(d.getDate() - Number(s.days_before_post));
           deadline = d.toISOString().split("T")[0];
         }
         return base44.entities.Subtask.create({
           job_id: created.id,
           title: s.title,
           responsible_id: s.responsible_id || "",
           responsible_name: s.responsible_name || "",
           complete_at_status: s.complete_at_status || "",
           notify_on_status: s.notify_on_status || "",
           days_before_post: s.days_before_post ?? undefined,
           deadline: deadline || undefined,
           order: s.order ?? i,
           status: "pending",
           is_completed: false,
         });
       }));
       // Notificar responsáveis cujas subtarefas têm notify_on_status = status inicial
       fireJobCreatedNotifications(created, createdSubs);
     }
    return created;
  }

  // Versão que aceita templateId explícito (usado no bulk modal)
  async function createJobFromPostWithTemplate(dayStr, post, templateId) {
    const fmt = post.formats?.[0];
    const formatLabel = FORMAT_OPTIONS.find(o => o.value === fmt)?.label || fmt || "Post";
    const content_type = contentTypeMap[fmt] || "outros";
    const template = templateId ? (allTemplatesList.find(t => t.id === templateId) || templates.find(t => t.id === templateId)) : findTemplateForPost(post);
    const title = template?.job_title || (post.text ? `${formatLabel} — ${post.text}` : formatLabel);

    const created = await base44.entities.Job.create({
      title,
      project_id: activeProject.id,
      project_name: activeProject.name,
      client_id: activeProject.client_id,
      client_name: activeProject.client_name,
      post_date: dayStr,
      content_type,
      status: "pending_briefing",
      template_id: template?.id || undefined,
      score: template?.score || 0,
    });

    if (template?.subtasks?.length) {
      const postDate = new Date(dayStr + "T12:00:00");
      const sortedSubtasks = [...template.subtasks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const wTemplSubs = await Promise.all(sortedSubtasks.map((s, i) => {
        let deadline;
        if (s.days_before_post !== undefined && postDate) {
          const d = new Date(postDate);
          d.setDate(d.getDate() - Number(s.days_before_post));
          deadline = d.toISOString().split("T")[0];
        }
        return base44.entities.Subtask.create({
          job_id: created.id,
          title: s.title,
          responsible_id: s.responsible_id || "",
          responsible_name: s.responsible_name || "",
          complete_at_status: s.complete_at_status || "",
          notify_on_status: s.notify_on_status || "",
          days_before_post: s.days_before_post ?? undefined,
          deadline: deadline || undefined,
          order: s.order ?? i,
          status: "pending",
          is_completed: false,
        });
      }));
      fireJobCreatedNotifications(created, wTemplSubs);
    }
    return created;
  }

  async function handleCreateJobForPost(dayStr, post) {
    const created = await createJobFromPost(dayStr, post);
    const updatedJobs = [created, ...existingJobs];
    setExistingJobs(updatedJobs);

    // Remove the draft post from schedule_data and let the job take its place
    setSchedule(prev => {
      const updatedDay = (prev[dayStr] || []).filter(p => p.id !== post.id);
      const newSched = { ...prev, [dayStr]: updatedDay };
      // Save only drafts
      saveSchedule(newSched);
      // Rebuild merged view
      const draftsOnly = {};
      Object.entries(newSched).forEach(([d, posts]) => {
        const drafts = posts.filter(p => !p.job_id && !p.job_created);
        if (drafts.length > 0) draftsOnly[d] = drafts;
      });
      return buildMergedSchedule(draftsOnly, updatedJobs);
    });
  }

  function openBulkModal() {
    const monthStr = format(currentDate, "yyyy-MM");
    const allPosts = [];
    Object.entries(schedule).filter(([d]) => d.startsWith(monthStr)).forEach(([dayStr, posts]) => {
      posts.filter(post => !post.cancelled && !post.job_id && !post.is_observation).forEach(post => {
        allPosts.push({ dayStr, post, suggestedTemplate: findTemplateForPost(post) });
      });
    });
    setBulkPosts(allPosts);
    setShowBulkModal(true);
  }

  async function handleBulkConfirm(selectedItems) {
    let draftSched = { ...schedule };
    const newJobs = [];

    for (const { dayStr, post, templateId } of selectedItems) {
      const created = await createJobFromPostWithTemplate(dayStr, post, templateId);
      newJobs.push(created);
      // Remove draft post that became a job
      draftSched = {
        ...draftSched,
        [dayStr]: (draftSched[dayStr] || []).filter(p => p.id !== post.id),
      };
    }

    const updatedJobs = [...newJobs, ...existingJobs];
    setExistingJobs(updatedJobs);
    
    // Save only drafts, rebuild merged
    await saveSchedule(draftSched);
    const draftsOnly = {};
    Object.entries(draftSched).forEach(([d, posts]) => {
      const drafts = posts.filter(p => !p.job_id && !p.job_created);
      if (drafts.length > 0) draftsOnly[d] = drafts;
    });
    setSchedule(buildMergedSchedule(draftsOnly, updatedJobs));
    setShowBulkModal(false);
  }

  async function downloadPDF() {
    const el = calendarRef.current;
    if (!el) return;

    const MARGIN = 10;
    const HEADER_H = 20;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const printW = pageW - MARGIN * 2;
    let printH = pageH - MARGIN - HEADER_H - MARGIN;

    // Fundo branco
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageW, pageH, "F");

    // Pré-carrega a logo vertical (símbolo D) para marca d'água central e células
    let simboloImg = null;
    try {
      simboloImg = new Image();
      simboloImg.crossOrigin = "anonymous";
      await new Promise((res, rej) => {
        simboloImg.onload = res;
        simboloImg.onerror = rej;
        simboloImg.src = LOGO_URL;
      });
    } catch { simboloImg = null; }

    // Marca d'água central — símbolo D, 20% opacidade, 50% da largura
    if (simboloImg) {
      const wmCanvas = document.createElement("canvas");
      wmCanvas.width = simboloImg.naturalWidth;
      wmCanvas.height = simboloImg.naturalHeight;
      const wmCtx = wmCanvas.getContext("2d");
      wmCtx.globalAlpha = 0.20;
      wmCtx.drawImage(simboloImg, 0, 0);
      const wmData = wmCanvas.toDataURL("image/png");
      const wmW = pageW * 0.5;
      const wmH = (simboloImg.naturalHeight / simboloImg.naturalWidth) * wmW;
      pdf.addImage(wmData, "PNG", (pageW - wmW) / 2, (pageH - wmH) / 2, wmW, wmH);
    }

    // ── HEADER ──────────────────────────────────────────────
    // Faixa azul top
    pdf.setFillColor(30, 64, 175);
    pdf.rect(0, 0, pageW, 1.5, "F");

    // Logo horizontal (Domínio Performance) à esquerda, na mesma linha do título
    let logoEndX = MARGIN;
    try {
      const hLogoImg = new Image();
      hLogoImg.crossOrigin = "anonymous";
      await new Promise((res, rej) => { hLogoImg.onload = res; hLogoImg.onerror = rej; hLogoImg.src = LOGO_HORIZONTAL_URL; });
      const hLogoH = 10.5;
      const hLogoW = (hLogoImg.naturalWidth / hLogoImg.naturalHeight) * hLogoH;
      const hLogoX = pageW - MARGIN - hLogoW;
      const hLogoY = MARGIN + 7 - hLogoH + 1;
      const hCanvas = document.createElement("canvas");
      hCanvas.width = hLogoImg.naturalWidth;
      hCanvas.height = hLogoImg.naturalHeight;
      hCanvas.getContext("2d").drawImage(hLogoImg, 0, 0);
      pdf.addImage(hCanvas.toDataURL("image/jpeg", 0.7), "JPEG", hLogoX, hLogoY, hLogoW, hLogoH);
      logoEndX = hLogoX;
    } catch {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(30, 64, 175);
      pdf.text("Domínio Performance", pageW - MARGIN - 40, MARGIN + 7);
    }

    // Título do projeto (esquerda, bold grande)
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.setTextColor(30, 41, 59);
    const pdfTitle = `${activeProject.client_name || activeProject.name} — ${monthLabelUpper}`;
    pdf.text(pdfTitle, MARGIN, MARGIN + 7);

    // Doc links — top-right, next to logo
    const docItems = [
      { link: docLink1, label: docLabel1 },
      { link: docLink2, label: docLabel2 },
    ].filter(item => item.link);
    let docRightY = MARGIN + 2;
    docItems.forEach((item, i) => {
      const displayLabel = item.label || `Doc ${i + 1}`;
      const prefix = "Clique aqui para acessar: ";
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.setTextColor(120, 120, 120);
      const prefixW = pdf.getTextWidth(prefix);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(220, 38, 38);
      const labelW = pdf.getTextWidth(displayLabel);
      const totalW = prefixW + labelW;
      const docX = logoEndX - totalW - 3;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(6);
      pdf.setTextColor(120, 120, 120);
      pdf.text(prefix, docX, docRightY + 3);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7);
      pdf.setTextColor(220, 38, 38);
      pdf.text(displayLabel, docX + prefixW, docRightY + 3);
      pdf.link(docX, docRightY + 0.5, totalW, 3.5, { url: item.link });
      pdf.setDrawColor(220, 38, 38);
      pdf.setLineWidth(0.15);
      pdf.line(docX + prefixW, docRightY + 3.5, docX + totalW, docRightY + 3.5);
      docRightY += 5;
    });
    const actualHeaderH = HEADER_H;

    // Linha divisória
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, actualHeaderH, pageW - MARGIN, actualHeaderH);

    // ── CALENDÁRIO ──────────────────────────────────────────
    const calHeader = el.querySelector('[data-pdf-hide]');
    if (calHeader) calHeader.style.display = 'none';

    // Esconde status de job antes da captura do PDF
    const jobStatusEls = el.querySelectorAll('[data-job-status]');
    jobStatusEls.forEach(node => node.style.display = 'none');

    // Injeta símbolo D (5% opacidade) nas células vazias antes da captura
    const overlays = [];
    if (simboloImg) {
      const emptyCells = el.querySelectorAll('[data-empty-cell]');
      emptyCells.forEach(cell => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:1;`;
        const img = document.createElement('img');
        img.src = LOGO_URL;
        img.style.cssText = `width:60%;height:auto;opacity:0.05;`;
        img.crossOrigin = 'anonymous';
        overlay.appendChild(img);
        cell.style.position = 'relative';
        cell.appendChild(overlay);
        overlays.push({ cell, overlay });
      });
    }

    // PDF: expande as células do dia para mostrar TODOS os jobs, sem cortar
    const dayScrollEls = el.querySelectorAll('[data-day-scroll]');
    const dayScrollPrev = [];
    dayScrollEls.forEach(node => {
      dayScrollPrev.push({ node, maxHeight: node.style.maxHeight, overflowY: node.style.overflowY, overflow: node.style.overflow });
      node.style.maxHeight = 'none';
      node.style.overflowY = 'visible';
      node.style.overflow = 'visible';
    });
    // aguarda o reflow antes da captura
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(el, {
      scale: 1.8,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      allowTaint: true,
    });

    // Restaura a altura original das células do dia
    dayScrollPrev.forEach(({ node, maxHeight, overflowY, overflow }) => {
      node.style.maxHeight = maxHeight;
      node.style.overflowY = overflowY;
      node.style.overflow = overflow;
    });

    // Remove overlays temporários e restaura status de job
    overlays.forEach(({ cell, overlay }) => { cell.removeChild(overlay); });
    jobStatusEls.forEach(node => node.style.display = '');
    if (calHeader) calHeader.style.display = '';

    // JPEG com compressão para manter arquivo leve
    const imgData = canvas.toDataURL("image/jpeg", 0.70);

    const canvasAspect = canvas.width / canvas.height;
    const pdfAspect = printW / printH;
    let imgW, imgH;
    if (canvasAspect > pdfAspect) {
      imgW = printW; imgH = printW / canvasAspect;
    } else {
      imgH = printH; imgW = printH * canvasAspect;
    }

    // Recalculate printH based on actual header height (with doc links)
    printH = pageH - MARGIN - actualHeaderH - MARGIN;
    if (canvasAspect > (printW / printH)) {
      imgW = printW; imgH = printW / canvasAspect;
    } else {
      imgH = printH; imgW = printH * canvasAspect;
    }
    const imgX = MARGIN + (printW - imgW) / 2;
    const imgY = actualHeaderH + 2 + (printH - imgH) / 2;
    pdf.addImage(imgData, "JPEG", imgX, imgY, imgW, imgH);

    // Overlay clickable areas on entire post cards that have a reference_url
    const elRect = el.getBoundingClientRect();
    const scaleX = imgW / elRect.width;
    const scaleY = imgH / elRect.height;
    const refCards = el.querySelectorAll('[data-reference-url]');
    refCards.forEach(card => {
      const url = card.getAttribute("data-reference-url");
      if (!url) return;
      const cardRect = card.getBoundingClientRect();
      const relX = cardRect.left - elRect.left;
      const relY = cardRect.top - elRect.top;
      const pdfLinkX = imgX + relX * scaleX;
      const pdfLinkY = imgY + relY * scaleY;
      const pdfLinkW = cardRect.width * scaleX;
      const pdfLinkH = cardRect.height * scaleY;
      pdf.link(pdfLinkX, pdfLinkY, pdfLinkW, pdfLinkH, { url });
    });

    pdf.save(`Cronograma-${activeProject.client_name || activeProject.name}_${format(currentDate, "MMMM_yyyy", { locale: ptBR })}.pdf`);
  }

  const monthLabel = format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
  const monthLabelUpper = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);



  return createPortal(
    <>
    <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
    <div ref={modalRef} className="bg-white shadow-2xl flex flex-col overflow-hidden border border-gray-200 rounded-xl"
      style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 2rem)", maxWidth: "1400px", height: "calc(100vh - 70px)", maxHeight: "calc(100vh - 70px)", zIndex: 10000, borderRadius: 12 }}
      onClick={e => e.stopPropagation()}>

        {/* Toolbar */}
        <div className="border-b border-gray-200 bg-white flex-shrink-0">
          {/* Client project tabs */}
          {clientProjects.length > 1 && (
            <div className="flex items-center gap-0 px-4 pt-1 border-b border-gray-100 overflow-x-auto">
              {clientProjects.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProjectId(p.id); }}
                  className={`px-3 py-1.5 text-[10px] font-bold whitespace-nowrap border-b-2 transition-colors ${
                    p.id === activeProjectId
                      ? "border-blue-600 text-blue-700 bg-blue-50/50"
                      : "border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          <div className="px-4 h-12 flex items-center gap-3">
          {/* Month nav */}
          <button onClick={() => setCurrentDate(d => subMonths(d, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0">
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-bold text-gray-800 min-w-[120px] text-center flex-shrink-0">{monthLabelUpper}</span>
          <button onClick={() => setCurrentDate(d => addMonths(d, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0">
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>

          {/* Team selector */}
          {projectTeams.length > 0 && (
            <Select value={selectedTeam} onValueChange={setSelectedTeam}>
              <SelectTrigger className="w-36 h-7 text-xs flex-shrink-0">
                <SelectValue placeholder="Equipe" />
              </SelectTrigger>
              <SelectContent>
                {projectTeams.map(team => (
                  <SelectItem key={team} value={team}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

          {/* Legend */}
          <div className="flex items-center gap-3 flex-1 overflow-x-auto">
            {FORMAT_OPTIONS.map(f => (
              <span key={f.value} className="flex items-center gap-1 text-[10px] font-bold whitespace-nowrap flex-shrink-0" style={{ color: f.text }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: f.bg }} />
                {f.label}
              </span>
            ))}
          </div>

          {/* Actions */}
          <Button size="sm" variant="outline" onClick={downloadPDF} className="gap-1.5 h-7 text-xs border-gray-300 flex-shrink-0">
            <Download className="w-3.5 h-3.5" /> PDF
          </Button>
          <Button size="sm" onClick={openBulkModal} className="gap-1.5 h-7 text-xs flex-shrink-0">
            <Briefcase className="w-3.5 h-3.5" /> Criar Jobs
          </Button>

          {/* Close */}
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500 flex-shrink-0 ml-1">
            <X className="w-4 h-4" />
          </button>
          </div>
        </div>

        {/* Calendar content — fit entire month on screen */}
        <div className="flex-1 overflow-auto p-2 bg-gray-50 flex flex-col">
          <div ref={calendarRef} className="bg-white/90 rounded-xl shadow-sm border border-gray-100 overflow-visible flex flex-col">

            {/* Header */}
            <div data-pdf-hide className="px-4 pt-3 pb-2 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
              <div>
                <h1 className="text-base font-black text-gray-800 tracking-tight leading-tight">{activeProject.name}</h1>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">
                  Cronograma · {monthLabelUpper}
                </p>
              </div>
              <div className="ml-auto flex flex-col gap-1">
                {[
                  { link: docLink1, setLink: setDocLink1, label: docLabel1, setLabel: setDocLabel1, field: "doc_link_1", labelField: "doc_label_1", num: 1 },
                  { link: docLink2, setLink: setDocLink2, label: docLabel2, setLabel: setDocLabel2, field: "doc_link_2", labelField: "doc_label_2", num: 2 },
                ].map(doc => (
                  <div key={doc.num} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Doc {doc.num}:</span>
                    <input
                      type="url"
                      placeholder="Cole o link aqui"
                      value={doc.link}
                      onChange={e => doc.setLink(e.target.value)}
                      onBlur={() => base44.entities.Project.update(activeProjectId, { [doc.field]: doc.link }).catch(() => {})}
                      className="h-6 w-40 text-[10px] px-2 rounded border border-gray-200 bg-white text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400"
                    />
                    <input
                      type="text"
                      placeholder="Nome (ex: Roteiro)"
                      value={doc.label}
                      onChange={e => doc.setLabel(e.target.value)}
                      onBlur={() => base44.entities.Project.update(activeProjectId, { [doc.labelField]: doc.label }).catch(() => {})}
                      className="h-6 w-28 text-[10px] px-2 rounded border border-gray-200 bg-white text-gray-700 placeholder-gray-300 focus:outline-none focus:border-blue-400"
                    />
                    {doc.link && (
                      <a
                        href={doc.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-0.5 text-[10px] font-bold text-red-600 hover:text-red-800 hover:underline whitespace-nowrap"
                        title={doc.link}
                      >
                        <Link2 className="w-3 h-3 flex-shrink-0" />
                        {doc.label || `Doc ${doc.num}`}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Week header */}
            <div className="grid grid-cols-7 border-b border-gray-100 flex-shrink-0">
              {weekDays.map((wd, i) => (
                <div
                  key={wd}
                  className={`py-2 text-center text-[10px] font-black uppercase tracking-wider ${
                    i === 0 || i === 6 ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Days grid — não scrollável, mostra todo o mês na mesma página */}
            <DragDropContext onDragEnd={handleDragEnd}>
            <div className="overflow-visible">
              {Array.from({ length: totalWeeks }).map((_, weekIdx) => (
                <div key={weekIdx} data-week-row className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                  {calSlots.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, slotIdx) => {
                    if (!day) {
                      // Empty cell (before month start or after month end)
                      return <div key={slotIdx} data-empty-cell className="border-r border-gray-100 bg-gray-50/30" style={{ minHeight: "120px" }} />;
                    }
                    const dayStr = format(day, "yyyy-MM-dd");
                    return (
                      <DayCell
                        key={dayStr}
                        date={day}
                        posts={schedule[dayStr] || []}
                        onAddPost={addPost}
                        onUpdatePost={updatePost}
                        onCancelPost={cancelPost}
                        onCompletePost={completePost}
                        onCreateJobForPost={handleCreateJobForPost}
                        isCurrentMonth={true}
                        jobsByPostId={jobsByPostId}
                        onOpenForm={openForm}
                        activeFormDay={activeFormDay}
                        compact={true}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            </DragDropContext>
          </div>
        </div>
      </div>
    {showBulkModal && (
      <BulkJobConfirmModal
        posts={bulkPosts}
        templates={templates}
        allTemplates={allTemplatesList}
        defaultTeam={selectedTeam || projectTeams[0] || ""}
        onConfirm={handleBulkConfirm}
        onClose={() => setShowBulkModal(false)}
      />
    )}
    {activeFormDay && (
      <AddPostForm
        position={formPosition}
        containerBounds={containerBounds}
        onAdd={post => { addPost(activeFormDay, post); closeForm(); }}
        onCancel={closeForm}
      />
    )}
    </>,
    document.body
  );
}
