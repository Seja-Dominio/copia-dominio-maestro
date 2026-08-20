import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Loader2, FileText } from "lucide-react";
import NoteEditorDrawer from "./NoteEditorDrawer";

export default function NotesTab() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  const collabSession = sessionStorage.getItem("collaborator");
  const collab = collabSession ? JSON.parse(collabSession) : null;
  const collabId = collab?.id;

  useEffect(() => {
    if (!collabId) return;
    base44.entities.Note.filter({ collaborator_id: collabId }, "-created_date", 50)
      .then(setNotes)
      .finally(() => setLoading(false));
  }, [collabId]);

  async function createNote() {
    if (!collabId) return;
    setCreating(true);
    const created = await base44.entities.Note.create({
      title: "Nova anotação",
      content: "",
      collaborator_id: collabId,
      collaborator_name: collab?.name || "",
    });
    setNotes(prev => [created, ...prev]);
    setCreating(false);
    setEditingNote(created);
  }

  function handleUpdate(noteId, data) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...data } : n));
    if (editingNote?.id === noteId) setEditingNote(prev => ({ ...prev, ...data }));
  }

  function handleDelete(noteId) {
    setNotes(prev => prev.filter(n => n.id !== noteId));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Create button */}
        <div className="px-3 py-2 border-b border-border">
          <button
            onClick={createNote}
            disabled={creating}
            className="w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 no-touch-min"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Nova Anotação
          </button>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
          {notes.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Nenhuma anotação ainda
            </div>
          ) : (
            notes.map(note => (
              <button
                key={note.id}
                onClick={() => setEditingNote(note)}
                className="w-full flex items-start gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left no-touch-min"
              >
                <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{note.title || "Sem título"}</p>
                  {note.content && note.content !== "<p><br></p>" ? (
                    <div
                      className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 [&_*]:!m-0 [&_*]:!p-0 [&_*]:!text-[10px]"
                      dangerouslySetInnerHTML={{ __html: note.content }}
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic mt-0.5">Vazio</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Fullscreen editor drawer */}
      {editingNote && (
        <NoteEditorDrawer
          note={editingNote}
          onClose={() => setEditingNote(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}