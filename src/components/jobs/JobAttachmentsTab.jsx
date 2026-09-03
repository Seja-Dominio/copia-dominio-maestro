import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, Download, FileText, Image, Film, Archive, File, X, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import ImageAnnotations from "./ImageAnnotations";
import { Button } from "@/components/ui/button";


function getFileIcon(name) {
  const ext = name?.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return { Icon: Image, color: "text-green-500" };
  if (["mp4","mov","avi","webm"].includes(ext)) return { Icon: Film, color: "text-purple-500" };
  if (["zip","rar","7z"].includes(ext)) return { Icon: Archive, color: "text-amber-500" };
  if (["pdf","doc","docx","txt","xls","xlsx"].includes(ext)) return { Icon: FileText, color: "text-blue-500" };
  return { Icon: File, color: "text-muted-foreground" };
}

function isImage(name, url) {
  if (!name && url) {
    return url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i) || url.includes("supabase") || url.includes("storage");
  }
  const ext = name?.split(".").pop()?.toLowerCase();
  return ["jpg","jpeg","png","gif","webp","svg"].includes(ext);
}

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Full-screen lightbox with navigation and annotations
function Lightbox({ item, onClose, onDelete, onDeleteRequest, fullscreen, allImages, currentIndex, onNavigate, annotations, onAnnotationsChange, currentUser, isAdmin }) {
  const imgContainerRef = useRef(null);

  // Keyboard nav via window listener — doesn't steal focus from other inputs
  useEffect(() => {
    function handleKey(e) {
      // Don't intercept if user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.key === "ArrowLeft" && allImages && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && allImages && currentIndex < allImages.length - 1) onNavigate(currentIndex + 1);
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, allImages, onNavigate, onClose]);

  async function handleDownload() {
    const res = await fetch(item.url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name || "arquivo";
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasPrev = allImages && currentIndex > 0;
  const hasNext = allImages && currentIndex < allImages.length - 1;
  const isImg = isImage(item.name, item.url);
  const hasAnnotations = annotations && annotations.length > 0;

  const baseClass = fullscreen
    ? "w-full h-full bg-black/95 flex flex-col overflow-hidden"
    : "w-full max-w-2xl max-h-[90vh] bg-black/95 flex flex-col rounded-2xl overflow-hidden shadow-2xl";

  const content = (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60" style={{ zIndex: 10001 }} onClick={onClose}>
      <div className={baseClass} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0 bg-black/40" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
          <span className="text-sm font-semibold text-white truncate">{item.name || "Imagem"}</span>
          {allImages && allImages.length > 1 && (
            <span className="text-xs text-white/60 flex-shrink-0">{currentIndex + 1}/{allImages.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onDelete && !item.fromComment && (
            <button onClick={() => onDeleteRequest?.()}
              className="w-8 h-8 rounded-lg bg-red-600/80 hover:bg-red-600 flex items-center justify-center text-white transition-colors" title="Excluir">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={handleDownload}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" title="Baixar">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative" onClick={e => e.stopPropagation()}>
        {/* Previous button — full height */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/25 to-transparent hover:from-black/45 flex items-center justify-center text-white transition-colors z-10 cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {isImg ? (
          <div className="relative max-w-full max-h-full" ref={imgContainerRef}>
            <img src={item.url} alt={item.name || "imagem"} className="max-w-full max-h-[calc(100vh-140px)] object-contain rounded-lg shadow-2xl" />
            {/* Annotations overlay — always active: click to add, hover to view */}
            {onAnnotationsChange && (
              <div className="absolute inset-0" style={{ pointerEvents: "auto" }}>
                <ImageAnnotations
                  annotations={annotations || []}
                  currentUser={currentUser}
                  onAnnotationsChange={onAnnotationsChange}
                  containerRef={imgContainerRef}
                />
              </div>
            )}
            {!onAnnotationsChange && hasAnnotations && (
              <div className="absolute inset-0" style={{ pointerEvents: "auto" }}>
                {annotations.map((ann, i) => (
                  <div key={ann.id || i} className="absolute group"
                    style={{ left: `${ann.x}%`, top: `${ann.y}%`, transform: "translate(-50%, -50%)" }}>
                    <div className="w-6 h-6 rounded-full bg-amber-400 text-black text-[11px] font-black flex items-center justify-center shadow-lg border-2 border-white select-none cursor-pointer">
                      {i + 1}
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 min-w-[160px] max-w-[240px] bg-card border border-border rounded-xl shadow-xl p-2.5 z-30 hidden group-hover:block">
                      <p className="text-xs text-foreground leading-relaxed mb-1">{ann.text}</p>
                      <span className="text-[10px] text-muted-foreground">{ann.author}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-white">
            <FileText className="w-16 h-16 opacity-60" />
            <p className="text-sm opacity-80">Pré-visualização não disponível para este tipo de arquivo</p>
            <button onClick={handleDownload}
              className="flex items-center gap-2 text-sm bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-semibold transition-colors">
              <Download className="w-4 h-4" /> Baixar arquivo
            </button>
          </div>
        )}

        {/* Next button — full height */}
        {hasNext && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/35 to-transparent hover:from-black/55 flex items-center justify-center text-white transition-colors z-10 cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
      </div>
    </div>
  );

  // Always portal to body so the lightbox renders above any drawer/modal
  return createPortal(content, document.body);
}

export default function JobAttachmentsTab({ attachments = [], commentImages = [], onAttachmentsChange, fullscreenLightbox = false, currentUser = "", isAdmin = false, uploadContext = {} }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const fileInputRef = useRef(null);

  function getFileNameForDelete() {
    if (deleteConfirm?.type === "attachment") {
      const att = attachments[deleteConfirm.index];
      return att?.name || "arquivo";
    }
    return "anexo";
  }

  async function handleUpload(files) {
    if (!files?.length) return;
    setUploading(true);
    const uploaded = [];
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      if (file.size > 50 * 1024 * 1024) { alert(`Arquivo "${file.name}" excede 50 MB.`); continue; }
      setUploadProgress(`${i + 1}/${total} — ${file.name}`);

      try {
        // Upload via plataforma (sempre funciona)
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (!file_url) throw new Error("URL não retornada");

        uploaded.push({
          name: file.name,
          url: file_url,
          size: file.size,
          type: file.type,
          uploaded_at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Erro no upload:", file.name, err);
        alert(`Falha ao enviar "${file.name}". Tente novamente.`);
      }
    }

    setUploading(false);
    setUploadProgress("");
    if (uploaded.length) onAttachmentsChange([...attachments, ...uploaded]);
  }

  function handleDelete(index) {
    onAttachmentsChange(attachments.filter((_, i) => i !== index));
    setDeleteConfirm(null);
  }

  function handleConfirmDelete() {
    if (deleteConfirm?.type === "attachment") {
      handleDelete(deleteConfirm.index);
    } else if (deleteConfirm?.type === "lightbox") {
      deleteConfirm.callback?.();
      setLightbox(null);
    }
    setDeleteConfirm(null);
  }

  const imageAttachments = attachments.filter(a => isImage(a.name, a.url));
  const allImages = [
    ...commentImages.map(url => ({ url, name: "Imagem do comentário", fromComment: true })),
    ...imageAttachments.map(a => ({ ...a, fromComment: false, attachIndex: attachments.indexOf(a) })),
  ];
  const fileAttachments = attachments.filter(a => !isImage(a.name, a.url));

  return (
    <>
      {/* Delete confirmation dialog */}
      {!!deleteConfirm && createPortal(
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 10002 }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-[90%] space-y-4">
            <h3 className="text-base font-bold text-foreground">Excluir anexo</h3>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir permanentemente:</p>
              <p className="bg-muted/50 rounded-lg px-3 py-2 text-xs font-semibold text-foreground truncate">
                {getFileNameForDelete()}
              </p>
              <p className="text-xs text-muted-foreground">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleConfirmDelete}>Excluir permanentemente</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

    <div className="flex flex-col h-full">
      {lightbox && (() => {
        const item = lightbox.item;
        const attachIdx = item.attachIndex;
        const att = attachIdx != null ? attachments[attachIdx] : null;
        const itemAnnotations = att?.annotations || [];

        return (
          <Lightbox
            item={item}
            currentIndex={lightbox.index}
            allImages={allImages}
            currentUser={currentUser}
            isAdmin={isAdmin}
            annotations={itemAnnotations}
            onAnnotationsChange={att ? (newAnnotations) => {
              const updated = [...attachments];
              updated[attachIdx] = { ...updated[attachIdx], annotations: newAnnotations };
              onAttachmentsChange(updated);
            } : undefined}
            onNavigate={(newIndex) => {
              const img = allImages[newIndex];
              setLightbox({ item: img, index: newIndex });
            }}
            onClose={() => setLightbox(null)}
            fullscreen={fullscreenLightbox}
            onDelete={attachIdx != null ? () => {
              handleDelete(attachIdx);
              setLightbox(null);
            } : undefined}
            onDeleteRequest={attachIdx != null ? () => setDeleteConfirm({ type: "lightbox", callback: () => { handleDelete(attachIdx); setLightbox(null); } }) : undefined}
          />
        );
      })()}

      {/* Upload zone */}
      <div className="m-3 border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
        onClick={() => fileInputRef.current?.click()}
        onDrop={e => { e.preventDefault(); handleUpload(Array.from(e.dataTransfer.files)); }}
        onDragOver={e => e.preventDefault()}>
        <input ref={fileInputRef} type="file" multiple className="hidden"
          onChange={e => { handleUpload(Array.from(e.target.files)); e.target.value = ""; }} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Enviando arquivo...</p>
            <p className="text-[10px] text-primary font-semibold">{uploadProgress}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-1">
            <Upload className="w-6 h-6 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">Clique, arraste ou cole (Ctrl+V) aqui</p>
            <p className="text-[10px] text-muted-foreground">Máx. 50 MB por arquivo</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">

        {/* Images grid */}
        {allImages.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
              Imagens ({allImages.length})
            </p>
            <div className="space-y-2">
              {allImages.map((img, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden border border-border cursor-pointer bg-muted/30"
                  onClick={() => setLightbox({ item: img, index: i })}>
                  <img src={img.url} alt={img.name} className="w-full h-auto max-h-[300px] object-cover transition-transform group-hover:scale-[1.02]" />
                  {img.fromComment && (
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md font-semibold">💬 Comentário</div>
                  )}
                  {!img.fromComment && img.annotations?.length > 0 && (
                    <div className="absolute top-2 right-2 bg-amber-400 text-black text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" /> {img.annotations.length}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File list */}
        {fileAttachments.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
              Arquivos ({fileAttachments.length})
            </p>
            <div className="space-y-1.5">
              {fileAttachments.map((att, i) => {
                const realIndex = attachments.indexOf(att);
                const { Icon, color } = getFileIcon(att.name);
                return (
                  <div key={i} className="group flex items-center gap-2.5 p-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors cursor-pointer"
                    onClick={() => setLightbox({ item: { url: att.url, name: att.name, attachIndex: realIndex }, index: -1 })}>
                    <Icon className={`w-5 h-5 flex-shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{att.name}</p>
                      {att.size && <p className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</p>}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setDeleteConfirm({ type: "attachment", index: realIndex })}
                        className="w-6 h-6 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {allImages.length === 0 && fileAttachments.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">Nenhum anexo ainda</div>
        )}
      </div>
    </div>
    </>
  );
}