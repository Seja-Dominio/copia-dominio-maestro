import { useState, useRef, useEffect } from "react";
import { X, Trash2, Pencil, Check } from "lucide-react";

/**
 * Annotation pin displayed on an image.
 * Shows tooltip on hover with the comment text.
 */
function AnnotationPin({ annotation, number, isOwner, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(annotation.text);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleSave() {
    if (editText.trim()) {
      onEdit(editText.trim());
    }
    setEditing(false);
  }

  return (
    <div
      className="absolute z-20"
      style={{ left: `${annotation.x}%`, top: `${annotation.y}%`, transform: "translate(-50%, -50%)" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setEditing(false); setEditText(annotation.text); }}
      onClick={e => e.stopPropagation()}
    >
      {/* Yellow numbered circle */}
      <div className="w-6 h-6 rounded-full bg-amber-400 text-black text-[11px] font-black flex items-center justify-center cursor-pointer shadow-lg border-2 border-white select-none">
        {number}
      </div>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 min-w-[180px] max-w-[260px] bg-card border border-border rounded-xl shadow-xl p-2.5 z-30"
          onClick={e => e.stopPropagation()}>
          {editing ? (
            <div className="space-y-1.5">
              <textarea
                ref={inputRef}
                className="w-full text-xs bg-background border border-input rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); } }}
              />
              <div className="flex gap-1 justify-end">
                <button onClick={() => { setEditing(false); setEditText(annotation.text); }}
                  className="w-6 h-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
                <button onClick={handleSave}
                  className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-foreground leading-relaxed mb-1">{annotation.text}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{annotation.author}</span>
                {isOwner && (
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => setEditing(true)}
                      className="w-5 h-5 rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={onDelete}
                      className="w-5 h-5 rounded hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * New annotation input that appears at click position.
 */
function NewAnnotationInput({ x, y, onSubmit, onCancel }) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSubmit() {
    if (text.trim()) onSubmit(text.trim());
  }

  return (
    <div
      className="fixed z-30 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      onClick={e => e.stopPropagation()}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl p-2.5 w-[220px]">
        <textarea
          ref={inputRef}
          placeholder="Digite o comentário..."
          className="w-full text-xs bg-background border border-input rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          rows={2}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex gap-1.5 mt-1.5">
          <button onClick={onCancel}
            className="flex-1 h-6 rounded-lg border border-border text-[10px] font-semibold text-muted-foreground hover:bg-muted transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={!text.trim()}
            className="flex-1 h-6 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Overlay that renders all annotation pins on an image.
 * Manages click-to-add, edit, and delete.
 */
export default function ImageAnnotations({ annotations = [], currentUser, onAnnotationsChange, containerRef }) {
  const [newPin, setNewPin] = useState(null); // { x, y } percentage

  function handleImageClick(e) {
    if (!containerRef?.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setNewPin({ x, y });
  }

  function handleSubmitAnnotation(text) {
    const annotation = {
      id: Date.now().toString(),
      x: newPin.x,
      y: newPin.y,
      text,
      author: currentUser,
      created_at: new Date().toISOString(),
    };
    onAnnotationsChange([...annotations, annotation]);
    setNewPin(null);
  }

  function handleEdit(idx, newText) {
    const updated = annotations.map((a, i) => i === idx ? { ...a, text: newText } : a);
    onAnnotationsChange(updated);
  }

  function handleDelete(idx) {
    onAnnotationsChange(annotations.filter((_, i) => i !== idx));
  }

  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      onClick={handleImageClick}
    >
      {annotations.map((ann, i) => (
        <AnnotationPin
          key={ann.id || i}
          annotation={ann}
          number={i + 1}
          isOwner={ann.author === currentUser}
          onEdit={newText => handleEdit(i, newText)}
          onDelete={() => handleDelete(i)}
        />
      ))}
      {newPin && (
        <NewAnnotationInput
          x={newPin.x}
          y={newPin.y}
          onSubmit={handleSubmitAnnotation}
          onCancel={() => setNewPin(null)}
        />
      )}
    </div>
  );
}