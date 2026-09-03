import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

const QUILL_MODULES = {
  toolbar: [
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ header: [1, 2, 3, false] }],
    ["clean"],
  ],
};

export default function NoteEditorDrawer({ note, onClose, onUpdate, onDelete }) {
  const [title, setTitle] = useState(note.title || "");
  const [content, setContent] = useState(note.content || "");
  const [deleting, setDeleting] = useState(false);
  const saveTimer = useRef(null);

  function saveField(field, value) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      base44.entities.Note.update(note.id, { [field]: value });
      onUpdate(note.id, { [field]: value });
    }, 600);
  }

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  async function handleDelete() {
    setDeleting(true);
    await base44.entities.Note.delete(note.id);
    onDelete(note.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[70] bg-card flex flex-col animate-slide-up"
      style={{ top: "calc(56px + env(safe-area-inset-top, 0px))" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors no-touch-min"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input
          className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none"
          value={title}
          onChange={e => { setTitle(e.target.value); saveField("title", e.target.value); }}
          placeholder="Sem título..."
        />
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors no-touch-min"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Editor — fills remaining space */}
      <div className="flex-1 overflow-hidden note-fullscreen-editor">
        <ReactQuill
          theme="snow"
          value={content}
          onChange={val => { setContent(val); saveField("content", val); }}
          modules={QUILL_MODULES}
          placeholder="Escreva sua anotação..."
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        />
      </div>
    </div>
  );
}