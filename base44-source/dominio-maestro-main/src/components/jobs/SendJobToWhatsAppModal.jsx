import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, Send, MessageSquare, Check, AlertCircle, Image, FileText, RefreshCw, CheckSquare, Square } from "lucide-react";

export default function SendJobToWhatsAppModal({ job, onClose }) {
  const [client, setClient] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [caption, setCaption] = useState(job.caption || "");
  const [sendTextOnly, setSendTextOnly] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState("compose"); // "compose" | "sending" | "done"
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [loadingAttachments, setLoadingAttachments] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Load client
      if (job.client_id) {
        const list = await base44.entities.Client.filter({ id: job.client_id });
        if (list?.[0]) setClient(list[0]);
      }

      // Load fresh job data to get attachments + comment images
      setLoadingAttachments(true);
      try {
        const [freshJobs, comments] = await Promise.all([
          base44.entities.Job.filter({ id: job.id }),
          base44.entities.Comment.filter({ entity_id: job.id, entity_type: "job" })
        ]);
        
        const freshJob = freshJobs?.[0];
        const jobAtts = freshJob?.attachments || job.attachments || [];
        
        // Extract images from comments
        const commentImages = [];
        for (const c of comments) {
          const regex = /!\[imagem\]\(([^)]+)\)/g;
          let m;
          while ((m = regex.exec(c.content || "")) !== null) {
            const imgUrl = m[1];
            // Extract filename from URL
            let fileName = "imagem.jpg";
            try {
              const urlPath = new URL(imgUrl).pathname;
              const parts = urlPath.split("/");
              const lastPart = parts[parts.length - 1];
              if (lastPart) fileName = decodeURIComponent(lastPart);
            } catch {}
            commentImages.push({
              name: fileName,
              url: imgUrl,
              type: "image/jpeg",
              fromComment: true
            });
          }
        }
        
        // Combine job attachments + comment images
        const allAtts = [...jobAtts, ...commentImages];
        setAttachments(allAtts);
        
        // Pre-select all
        if (allAtts.length > 0) {
          setSelectedAttachments(allAtts.map((_, i) => i));
        }
      } catch (e) {
        setAttachments(job.attachments || []);
      } finally {
        setLoadingAttachments(false);
      }
    }
    loadData();
  }, [job.id, job.client_id]);

  const groupId = client?.whatsapp_group_id;

  function toggleAttachment(index) {
    setSelectedAttachments(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        setSendTextOnly(false);
        return [...prev, index];
      }
    });
  }

  function selectAll() {
    setSelectedAttachments(attachments.map((_, i) => i));
    setSendTextOnly(false);
  }

  function deselectAll() {
    setSelectedAttachments([]);
  }

  async function handleSend() {
    if (!groupId) {
      setStatus({ type: "error", text: "Este cliente não tem grupo WhatsApp configurado." });
      return;
    }

    const toSend = sendTextOnly ? [] : selectedAttachments.map(i => attachments[i]).filter(Boolean);

    if (toSend.length === 0 && !caption.trim()) {
      setStatus({ type: "error", text: "Selecione pelo menos um anexo ou escreva uma mensagem." });
      return;
    }

    setSending(true);
    setStatus(null);
    setStep("sending");

    try {
      // If text only or no attachments selected, send text
      if (toSend.length === 0 && caption.trim()) {
        const result = await base44.functions.invoke("sendWhatsapp", {
          phone: groupId,
          message: caption,
        });
        console.log("WhatsApp text result:", result);
        if (!result?.data?.success && !result?.data?.data?.zaapId) {
          throw new Error(result?.data?.error || "Erro ao enviar texto.");
        }
      } else {
        // Send each attachment
        const total = toSend.length;
        setSendProgress({ current: 0, total });

        for (let i = 0; i < total; i++) {
          const att = toSend[i];
          console.log(`=== SENDING FILE ${i+1}/${total} ===`);
          console.log("att.url:", att.url);
          console.log("att.name:", att.name);
          console.log("att.type:", att.type);
          console.log("phone/groupId:", groupId);
          setSendProgress({ current: i + 1, total });

          const result = await base44.functions.invoke("sendWhatsappFile", {
            phone: groupId,
            fileUrl: att.url,
            caption: i === 0 ? caption : "", // Caption only on first file
            fileName: att.name,
            fileType: att.type,
          });

          console.log("WhatsApp file result:", result);

          // result.data contains the function's Response.json() output
          if (!result?.data?.success && !result?.data?.data?.zaapId) {
            throw new Error(result?.data?.error || `Erro ao enviar ${att.name}`);
          }

          // Small delay between files to avoid rate limiting
          if (i < total - 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      setStep("done");
    } catch (e) {
      setStatus({ type: "error", text: e.message });
      setStep("compose");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            <h2 className="text-base font-bold text-foreground">Enviar para WhatsApp</h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "done" ? (
          <div className="px-5 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-base font-bold text-foreground mb-1">Enviado com sucesso!</p>
            <p className="text-sm text-muted-foreground mb-5">
              {selectedAttachments.length > 0 
                ? `${selectedAttachments.length} arquivo(s) enviado(s) para o grupo de ${client?.name}`
                : `Mensagem enviada para o grupo de ${client?.name}`}
            </p>
            <Button onClick={onClose} className="w-full">Fechar</Button>
          </div>
        ) : step === "sending" ? (
          <div className="px-5 py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-3">
              <RefreshCw className="w-7 h-7 text-blue-600 animate-spin" />
            </div>
            <p className="text-base font-bold text-foreground mb-1">Enviando...</p>
            {sendProgress.total > 0 && (
              <p className="text-sm text-muted-foreground">
                Arquivo {sendProgress.current} de {sendProgress.total}
              </p>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Client & Group */}
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Destino</p>
              <p className="text-sm font-bold text-foreground">{client?.name || job.client_name}</p>
              {groupId ? (
                <p className="text-xs font-mono text-green-600 mt-0.5">{groupId}</p>
              ) : (
                <p className="text-xs text-red-500 mt-0.5">⚠️ Grupo WhatsApp não configurado no cadastro do cliente</p>
              )}
            </div>

            {/* Attachments */}
            {loadingAttachments ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-5 h-5 text-muted-foreground animate-spin" />
                <span className="ml-2 text-xs text-muted-foreground">Carregando anexos...</span>
              </div>
            ) : attachments.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground">Selecionar Anexos ({selectedAttachments.length}/{attachments.length})</p>
                  <div className="flex gap-1">
                    <button onClick={selectAll} className="text-[10px] text-primary hover:underline">Todos</button>
                    <span className="text-[10px] text-muted-foreground">|</span>
                    <button onClick={deselectAll} className="text-[10px] text-muted-foreground hover:text-foreground">Nenhum</button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {attachments.map((att, i) => {
                    const isImg = att.type?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.url || att.name || "");
                    const isSelected = selectedAttachments.includes(i);
                    return (
                      <button key={i} onClick={() => toggleAttachment(i)}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${isSelected ? "border-green-400 bg-green-50 dark:bg-green-900/20" : "border-border hover:bg-muted"}`}>
                        <div className="flex-shrink-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-green-600" />
                          ) : (
                            <Square className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        {/* Thumbnail */}
                        {isImg ? (
                          <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-5 h-5 text-orange-500" />
                          </div>
                        )}
                        <span className="text-xs font-medium text-foreground truncate flex-1">{att.name || "Arquivo"}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { deselectAll(); setSendTextOnly(true); }}
                  className={`mt-2 w-full text-xs py-2 rounded-lg border transition-colors ${sendTextOnly ? "border-primary bg-primary/5 text-primary font-semibold" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  Enviar só texto (sem arquivos)
                </button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
                Nenhum anexo neste job. Será enviado apenas a legenda como texto.
              </div>
            )}

            {/* Caption */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Legenda / Mensagem</p>
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Legenda que será enviada junto..."
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={4}
              />
            </div>

            {status && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${status.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {status.text}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
              <Button onClick={handleSend} disabled={sending || !groupId} className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white">
                <Send className="w-4 h-4" />
                {selectedAttachments.length > 0 ? `Enviar ${selectedAttachments.length}` : "Enviar"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}