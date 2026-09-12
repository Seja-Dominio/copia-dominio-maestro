import { useState } from "react";
import { X, Download, FileText } from "lucide-react";

function isImage(att) {
  return att.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url || "");
}

export default function JobApprovalAttachments({ attachments }) {
  const [lightbox, setLightbox] = useState(null);

  const images = attachments.filter(isImage);
  const files = attachments.filter(a => !isImage(a));

  return (
    <div>
      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {images.map((att, i) => (
            <img
              key={i}
              src={att.url}
              alt={att.name}
              className="w-full aspect-square object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setLightbox(att)}
            />
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((att, i) => (
            <a
              key={i}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors no-underline"
            >
              <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <span className="text-sm text-slate-700 truncate flex-1">{att.name || "Arquivo"}</span>
              <Download className="w-4 h-4 text-slate-400" />
            </a>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
            onClick={() => setLightbox(null)}>
            <X className="w-5 h-5" />
          </button>
          <img src={lightbox.url} alt={lightbox.name} className="max-w-full max-h-[85vh] rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}