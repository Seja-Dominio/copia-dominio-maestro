import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain, Check, CheckSquare, History, Loader2, MessageSquare, RefreshCw, RotateCcw, Send, ShieldX, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeDominusAuditFunction, invokeDominusMemoryFunction } from "@/api/supabaseClient";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Manaus",
});

function formatDate(value) {
  if (!value) return "—";
  try { return DATE_FORMATTER.format(new Date(value)); } catch { return "—"; }
}

function scopeLabel(scope, scopeId) {
  if (scope === "agency") return "Agência";
  return `${scope === "group" ? "Grupo" : scope === "team" ? "Equipe" : "Usuário"}${scopeId ? ` · ${scopeId}` : ""}`;
}

function errorMessage(error) {
  return error?.details?.error || error?.message || "Não foi possível concluir a ação.";
}

function severityClass(severity) {
  if (severity === "critical" || severity === "high") return "border-red-200 bg-red-50 text-red-800";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function reviewStatusLabel(status) {
  return ({ approved: "Aprovado", rejected: "Rejeitado", edited: "Aprovado com edição", pending: "Aguardando revisão", expired: "Expirado" })[status] || status || "Sem status";
}

function eventLabel(type) {
  return ({ created: "Criado", edited: "Editado", approved: "Aprovado", rejected: "Rejeitado" })[type] || type || "Atualizado";
}

export default function DominusMemoryReviewPanel() {
  const [reviews, setReviews] = useState([]);
  const [memories, setMemories] = useState([]);
  const [comments, setComments] = useState([]);
  const [events, setEvents] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [view, setView] = useState("pending");
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [notice, setNotice] = useState(null);
  const [auditRuns, setAuditRuns] = useState([]);
  const [auditFindings, setAuditFindings] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditBusy, setAuditBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const result = await invokeDominusMemoryFunction("list");
      const nextReviews = Array.isArray(result.reviews) ? result.reviews : [];
      setReviews(nextReviews);
      setMemories(Array.isArray(result.memories) ? result.memories : []);
      setComments(Array.isArray(result.comments) ? result.comments : []);
      setEvents(Array.isArray(result.events) ? result.events : []);
      setSelectedIds((current) => current.filter((id) => nextReviews.some((item) => item.id === id && item.status === "pending")));
      setDrafts(Object.fromEntries(nextReviews.filter((item) => item.status === "pending").map((item) => [item.id, {
        rule: item.proposed_rule || "",
        rationale: item.rationale || "",
        scope: item.scope || "agency",
        scope_id: item.scope_id || "",
        note: "",
      }])));
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadAudits = useCallback(async () => {
    setAuditLoading(true);
    try {
      const result = await invokeDominusAuditFunction("list");
      setAuditRuns(Array.isArray(result.runs) ? result.runs : []);
      setAuditFindings(Array.isArray(result.findings) ? result.findings : []);
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => { loadAudits(); }, [loadAudits]);

  const pending = useMemo(() => reviews.filter((item) => item.status === "pending"), [reviews]);
  const reviewed = useMemo(() => reviews.filter((item) => item.status !== "pending"), [reviews]);
  const activeMemories = useMemo(() => memories.filter((item) => item.status === "active"), [memories]);

  const updateDraft = (id, field, value) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [field]: value } }));
  };

  const commentsFor = (reviewId) => comments.filter((item) => item.review_id === reviewId);
  const eventsFor = (reviewId) => events.filter((item) => item.review_id === reviewId);

  const toggleSelected = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.concat(id));
  };

  const selectAll = () => {
    setSelectedIds((current) => current.length === pending.length ? [] : pending.map((item) => item.id));
  };

  const process = async (action, item, extra = {}) => {
    setProcessing(`${action}:${item.id}`);
    setNotice(null);
    try {
      const result = await invokeDominusMemoryFunction(action, { review_id: item.id, ...extra });
      setNotice({ type: "success", text: action === "reject" ? "Aprendizado rejeitado." : "Memória aprovada e versionada." });
      if (result) await load();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setProcessing(null);
    }
  };

  const saveEdit = async (item) => {
    const draft = drafts[item.id] || {};
    setProcessing(`edit:${item.id}`);
    setNotice(null);
    try {
      const result = await invokeDominusMemoryFunction("edit", { review_id: item.id, rule: draft.rule, rationale: draft.rationale, scope: draft.scope, scope_id: draft.scope_id, note: "Proposta editada no painel do Dominus" });
      setReviews((current) => current.map((review) => review.id === item.id ? result.review : review));
      setEvents((current) => [{ review_id: item.id, event_type: "edited", actor_name: "Você", note: "Proposta editada no painel do Dominus", created_at: new Date().toISOString(), snapshot: { rule: draft.rule } }, ...current]);
      setNotice({ type: "success", text: "Edição salva. Ela ainda precisa ser aprovada." });
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setProcessing(null);
    }
  };

  const addComment = async (item) => {
    const body = String(commentDrafts[item.id] || "").trim();
    if (!body) return;
    setProcessing(`comment:${item.id}`);
    setNotice(null);
    try {
      const result = await invokeDominusMemoryFunction("comment", { review_id: item.id, body });
      setComments((current) => current.concat({ ...(result.comment || {}), author_name: "Você" }));
      setCommentDrafts((current) => ({ ...current, [item.id]: "" }));
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setProcessing(null);
    }
  };

  const approveSelected = async () => {
    const selected = pending.filter((item) => selectedIds.includes(item.id));
    if (!selected.length) return setNotice({ type: "info", text: "Selecione pelo menos um aprendizado no checklist." });
    setProcessing("bulk:approve");
    setNotice(null);
    try {
      for (const item of selected) {
        const draft = drafts[item.id] || {};
        if (!String(draft.rule || "").trim()) throw new Error("Toda regra selecionada precisa ter um texto antes da aprovação.");
        await invokeDominusMemoryFunction("approve", { review_id: item.id, ...draft });
      }
      setSelectedIds([]);
      setNotice({ type: "success", text: `${selected.length} aprendizado(s) aprovado(s) e versionado(s).` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setProcessing(null);
    }
  };

  const revert = async (memory) => {
    setProcessing(`revert:${memory.id}`);
    setNotice(null);
    try {
      await invokeDominusMemoryFunction("revert", { memory_id: memory.id });
      setNotice({ type: "success", text: "Memória revertida para a versão anterior." });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setProcessing(null);
    }
  };

  const runAudit = async () => {
    setAuditBusy(true);
    setNotice(null);
    try {
      const result = await invokeDominusAuditFunction("run");
      setNotice({ type: "success", text: `Auditoria concluída: ${result.findings_count || 0} achado(s) e ${result.candidates_created || 0} candidato(s) para revisão.` });
      await Promise.all([loadAudits(), load()]);
    } catch (error) {
      setNotice({ type: "error", text: errorMessage(error) });
    } finally {
      setAuditBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Revisão dos aprendizados do Dominus</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O resumo continua sendo enviado pelo WhatsApp às 20h. A aprovação acontece aqui, em checklist, com edição da proposta e histórico de apontamentos.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {notice && (
        <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : notice.type === "info" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Aguardando revisão</p><p className="mt-1 text-2xl font-bold text-amber-700">{pending.length}</p></div>
            <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Decisões registradas</p><p className="mt-1 text-2xl font-bold text-primary">{reviewed.length}</p></div>
            <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Memórias ativas</p><p className="mt-1 text-2xl font-bold text-emerald-700">{activeMemories.length}</p></div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2">
            <button type="button" onClick={() => setView("pending")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${view === "pending" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><CheckSquare className="h-4 w-4" /> Checklist ({pending.length})</button>
            <button type="button" onClick={() => setView("history")} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${view === "history" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><History className="h-4 w-4" /> Histórico ({reviewed.length})</button>
          </div>

          {view === "pending" ? <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-semibold">Checklist de aprovação</h3><p className="mt-1 text-xs text-muted-foreground">Revise, edite se necessário, registre um apontamento e aprove somente o que estiver correto.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={selectAll} disabled={!pending.length} className="gap-1.5">{selectedIds.length === pending.length && pending.length ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />} {selectedIds.length === pending.length && pending.length ? "Desmarcar todos" : "Selecionar todos"}</Button>
                <Button type="button" size="sm" onClick={approveSelected} disabled={processing === "bulk:approve" || !selectedIds.length} className="gap-1.5"><Check className="h-3.5 w-3.5" /> {processing === "bulk:approve" ? "Aprovando..." : "Aprovar selecionados"}</Button>
              </div>
            </div>
            {pending.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhum aprendizado aguardando revisão.</div> : <div className="space-y-3">
              {pending.map((item) => {
                const draft = drafts[item.id] || {};
                const itemBusy = processing?.endsWith(`:${item.id}`);
                const itemComments = commentsFor(item.id);
                return <article key={item.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start gap-3">
                    <button type="button" onClick={() => toggleSelected(item.id)} aria-label={selectedIds.includes(item.id) ? "Desmarcar aprendizado" : "Selecionar aprendizado"} className="mt-0.5 text-primary">{selectedIds.includes(item.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-muted-foreground" />}</button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.memory_key || "Regra sem chave"}</p><p className="mt-1 text-xs text-muted-foreground">Proposto em {formatDate(item.proposed_at)} · {scopeLabel(item.scope, item.scope_id)}</p></div><span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">Aguardando revisão</span></div>
                      <label className="mt-4 block text-xs font-semibold text-muted-foreground">Regra que será usada pelo Dominus<textarea value={draft.rule || ""} onChange={(event) => updateDraft(item.id, "rule", event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" /></label>
                      <label className="mt-3 block text-xs font-semibold text-muted-foreground">Justificativa<textarea value={draft.rationale || ""} onChange={(event) => updateDraft(item.id, "rationale", event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" /></label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-muted-foreground">Escopo<select value={draft.scope || "agency"} onChange={(event) => updateDraft(item.id, "scope", event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground"><option value="agency">Agência</option><option value="team">Equipe</option><option value="user">Usuário</option><option value="group">Grupo</option></select></label>{draft.scope && draft.scope !== "agency" && <label className="text-xs font-semibold text-muted-foreground">Identificador do escopo<input value={draft.scope_id || ""} onChange={(event) => updateDraft(item.id, "scope_id", event.target.value)} placeholder="ID do usuário, equipe ou grupo" className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" /></label>}</div>
                      <div className="mt-4 flex flex-wrap justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={() => saveEdit(item)} disabled={itemBusy || !String(draft.rule || "").trim()} className="gap-1.5"><History className="h-3.5 w-3.5" /> {processing === `edit:${item.id}` ? "Salvando..." : "Salvar edição"}</Button><Button type="button" size="sm" variant="outline" onClick={() => process("reject", item, { note: "Rejeitado pelo Master" })} disabled={itemBusy} className="gap-1.5"><ShieldX className="h-3.5 w-3.5" /> Rejeitar</Button><Button type="button" size="sm" onClick={() => process("approve", item, draft)} disabled={itemBusy || !String(draft.rule || "").trim()} className="gap-1.5"><Check className="h-3.5 w-3.5" /> {processing === `approve:${item.id}` ? "Aprovando..." : "Aprovar"}</Button></div>
                      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3"><div className="mb-2 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /><p className="text-xs font-semibold">Apontamentos da aprovação</p></div>{itemComments.length ? <div className="space-y-2">{itemComments.map((comment) => <div key={comment.id || `${comment.review_id}-${comment.created_at}`} className="rounded-lg bg-background px-3 py-2 text-xs"><p className="font-semibold text-foreground">{comment.author_name || "Master"} <span className="font-normal text-muted-foreground">· {formatDate(comment.created_at)}</span></p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{comment.body}</p></div>)}</div> : <p className="text-xs text-muted-foreground">Nenhum apontamento ainda.</p>}<div className="mt-2 flex gap-2"><input value={commentDrafts[item.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); addComment(item); } }} placeholder="Registre um ponto para esta aprovação" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs text-foreground" /><Button type="button" size="icon" onClick={() => addComment(item)} disabled={processing === `comment:${item.id}` || !String(commentDrafts[item.id] || "").trim()} title="Enviar apontamento"><Send className="h-4 w-4" /></Button></div></div>
                    </div>
                  </div>
                </article>;
              })}
            </div>}
          </section> : <section className="space-y-3">
            <div><h3 className="text-sm font-semibold">Histórico de decisões</h3><p className="mt-1 text-xs text-muted-foreground">Veja quem revisou, editou ou rejeitou cada proposta e os apontamentos relacionados.</p></div>
            {reviewed.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma decisão registrada ainda.</div> : <div className="space-y-3">{reviewed.map((item) => <article key={item.id} className="rounded-xl border bg-card p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.memory_key || "Regra sem chave"}</p><p className="mt-1 text-sm font-medium">{item.proposed_rule}</p><p className="mt-1 text-xs text-muted-foreground">Proposto em {formatDate(item.proposed_at)} · revisado em {formatDate(item.reviewed_at)} · por {item.reviewed_by || "Master"}</p></div><span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold">{reviewStatusLabel(item.status)}</span></div>{eventsFor(item.id).length > 0 && <div className="mt-3 space-y-2 border-l-2 border-primary/20 pl-3">{eventsFor(item.id).map((event) => <div key={event.id || `${event.review_id}-${event.created_at}`} className="text-xs"><p className="font-semibold text-foreground">{eventLabel(event.event_type)} · {event.actor_name || "Master"} <span className="font-normal text-muted-foreground">· {formatDate(event.created_at)}</span></p>{event.note && <p className="mt-1 text-muted-foreground">{event.note}</p>}</div>)}</div>}{commentsFor(item.id).length > 0 && <div className="mt-3 rounded-lg bg-muted/30 p-3"><p className="mb-2 flex items-center gap-2 text-xs font-semibold"><MessageSquare className="h-4 w-4 text-primary" /> Apontamentos</p>{commentsFor(item.id).map((comment) => <p key={comment.id || `${comment.review_id}-${comment.created_at}`} className="mb-1 text-xs text-muted-foreground"><strong>{comment.author_name || "Master"}:</strong> {comment.body}</p>)}</div>}</article>)}</div>}
          </section>}

          <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Auditoria operacional</h3></div><Button type="button" size="sm" variant="outline" onClick={runAudit} disabled={auditBusy} className="gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${auditBusy ? "animate-spin" : ""}`} /> {auditBusy ? "Auditando..." : "Executar agora"}</Button></div><p className="text-sm text-muted-foreground">Verifica briefings vazios, Jobs sem subtarefas, inconsistências de fluxo, indicadores divergentes e gargalos. A auditoria só aponta problemas; não altera Jobs.</p>{auditLoading ? <div className="flex min-h-20 items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div> : auditRuns.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma auditoria executada ainda.</div> : <><div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Última execução</p><p className="mt-1 text-sm font-semibold">{formatDate(auditRuns[0].finished_at || auditRuns[0].started_at)}</p></div><div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Achados</p><p className="mt-1 text-sm font-semibold">{auditRuns[0].findings_count || 0}</p></div><div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 text-sm font-semibold">{auditRuns[0].status === "completed" ? "Concluída" : auditRuns[0].status === "failed" ? "Falhou" : "Em andamento"}</p></div></div>{auditFindings.length > 0 && <div className="space-y-2">{auditFindings.slice(0, 12).map((finding) => <div key={finding.id} className={`rounded-lg border p-3 ${severityClass(finding.severity)}`}><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold">{finding.title}</p><span className="text-[10px] font-bold uppercase">{finding.severity}</span></div><p className="mt-1 text-xs">{finding.description}</p><p className="mt-2 text-xs font-medium">Próxima ação: {finding.suggested_action}</p></div>)}</div>}</>}</section>

          <section className="space-y-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Memórias ativas ({activeMemories.length})</h3></div>{activeMemories.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma regra permanente aprovada.</div> : <div className="space-y-2">{activeMemories.map((memory) => <div key={memory.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"><div className="min-w-0"><p className="text-sm font-medium">{memory.rule}</p><p className="mt-1 text-xs text-muted-foreground">{memory.memory_key} · {scopeLabel(memory.scope, memory.scope_id)} · versão {memory.version} · aprovada em {formatDate(memory.approved_at)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => revert(memory)} disabled={processing === `revert:${memory.id}`} className="shrink-0 gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> {processing === `revert:${memory.id}` ? "Revertendo..." : "Reverter"}</Button></div>)}</div>}</section>
        </>
      )}
    </div>
  );
}
