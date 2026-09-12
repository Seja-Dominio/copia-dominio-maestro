import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, RotateCcw, Loader2, AlertTriangle, Send, FileText, Calendar, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import JobApprovalAttachments from "@/components/approval/JobApprovalAttachments";

export default function JobApproval() {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(null); // "approve" | "request_changes"
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const jobId = params.get("jobId");
  const token = params.get("token");

  useEffect(() => {
    async function loadJob() {
      if (!jobId || !token) {
        setError("Link inválido. Parâmetros ausentes.");
        setLoading(false);
        return;
      }
      try {
        // Use handleJobApproval with a "load" action to get job data, or fetch directly
        const jobs = await base44.entities.Job.filter({ id: jobId });
        const found = jobs[0];
        if (!found) {
          setError("Job não encontrado.");
        } else {
          setJob(found);
        }
      } catch (e) {
        setError("Erro ao carregar o job.");
      }
      setLoading(false);
    }
    loadJob();
  }, [jobId, token]);

  async function handleSubmit() {
    if (!action) return;
    if (action === "request_changes" && !feedback.trim()) return;
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke("handleJobApproval", {
        jobId, token, action, feedback: feedback.trim(),
      });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || "Erro ao processar aprovação.");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800 mb-2">Ops!</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (result) {
    const isApproved = result.action === "approve";
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          {isApproved ? (
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          ) : (
            <RotateCcw className="w-16 h-16 text-blue-500 mx-auto mb-4" />
          )}
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            {isApproved ? "Aprovado com sucesso!" : "Alterações solicitadas"}
          </h2>
          <p className="text-sm text-slate-500">
            {isApproved
              ? "O job foi aprovado e será agendado para publicação. Obrigado!"
              : "Sua solicitação de alteração foi registrada. A equipe será notificada."}
          </p>
        </div>
      </div>
    );
  }

  const isApprovalStatus = job?.status === "internal_approval" || job?.status === "client_approval";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-2xl p-6 text-white mb-6 shadow-lg">
          <p className="text-sm opacity-80 mb-1">Aprovação de conteúdo</p>
          <h1 className="text-2xl font-bold">{job.title}</h1>
          <div className="flex items-center gap-4 mt-3 text-sm opacity-90">
            <span>{job.client_name}</span>
            {job.project_name && <span>• {job.project_name}</span>}
          </div>
        </div>

        {/* Job details card */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
          {/* Post date */}
          {job.post_date && (
            <div className="flex items-center gap-2 mb-4 text-sm text-slate-600">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span>Data de postagem: <strong>{new Date(job.post_date + "T12:00:00").toLocaleDateString("pt-BR")}</strong></span>
            </div>
          )}

          {/* Caption/Legenda */}
          {job.caption && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-blue-500" />
                Legenda
              </h3>
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap border border-slate-200">
                {job.caption}
              </div>
            </div>
          )}

          {/* Briefing */}
          {job.briefing && (
            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-700 mb-2">Briefing</h3>
              <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 whitespace-pre-wrap border border-slate-200">
                {job.briefing}
              </div>
            </div>
          )}

          {/* Attachments */}
          {job.attachments?.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
                <Image className="w-4 h-4 text-blue-500" />
                Anexos ({job.attachments.length})
              </h3>
              <JobApprovalAttachments attachments={job.attachments} />
            </div>
          )}
        </div>

        {/* Action area */}
        {!isApprovalStatus ? (
          <div className="bg-white rounded-2xl shadow-md p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Este job não está mais aguardando aprovação.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-md p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Sua decisão</h3>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setAction("approve")}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  action === "approve"
                    ? "border-green-500 bg-green-50"
                    : "border-slate-200 hover:border-green-300 hover:bg-green-50/50"
                }`}
              >
                <CheckCircle2 className={`w-8 h-8 mx-auto mb-2 ${action === "approve" ? "text-green-600" : "text-slate-400"}`} />
                <p className={`text-sm font-bold ${action === "approve" ? "text-green-700" : "text-slate-600"}`}>Aprovar</p>
                <p className="text-xs text-slate-400 mt-1">Conteúdo está perfeito</p>
              </button>
              <button
                onClick={() => setAction("request_changes")}
                className={`p-4 rounded-xl border-2 text-center transition-all ${
                  action === "request_changes"
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
                }`}
              >
                <RotateCcw className={`w-8 h-8 mx-auto mb-2 ${action === "request_changes" ? "text-blue-600" : "text-slate-400"}`} />
                <p className={`text-sm font-bold ${action === "request_changes" ? "text-blue-700" : "text-slate-600"}`}>Solicitar Alterações</p>
                <p className="text-xs text-slate-400 mt-1">Preciso de ajustes</p>
              </button>
            </div>

            {/* Feedback area */}
            {action === "request_changes" && (
              <div className="mb-4">
                <label className="text-sm font-semibold text-slate-700 mb-2 block">
                  Descreva as alterações necessárias *
                </label>
                <textarea
                  rows={4}
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Ex: Alterar a cor do fundo, trocar a foto principal, ajustar o texto..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )}

            {action === "approve" && (
              <div className="mb-4">
                <label className="text-sm font-semibold text-slate-700 mb-2 block">
                  Comentário (opcional)
                </label>
                <textarea
                  rows={2}
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Algum comentário adicional..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )}

            {/* Submit */}
            {action && (
              <Button
                onClick={handleSubmit}
                disabled={submitting || (action === "request_changes" && !feedback.trim())}
                className={`w-full h-12 text-sm font-bold rounded-xl ${
                  action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {submitting ? "Enviando..." : action === "approve" ? "Confirmar Aprovação" : "Enviar Solicitação de Alteração"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}