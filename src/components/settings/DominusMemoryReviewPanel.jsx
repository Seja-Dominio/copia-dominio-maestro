import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain, Check, History, Loader2, RefreshCw, RotateCcw, ShieldX } from "lucide-react";
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

export default function DominusMemoryReviewPanel() {
  const [reviews, setReviews] = useState([]);
  const [memories, setMemories] = useState([]);
  const [drafts, setDrafts] = useState({});
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
  const activeMemories = useMemo(() => memories.filter((item) => item.status === "active"), [memories]);

  const updateDraft = (id, field, value) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), [field]: value } }));
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
            <h2 className="text-lg font-semibold">Aprendizados do Dominus</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            O Dominus só incorpora uma regra depois da revisão explícita do Master. Dados atuais, respostas e mensagens não viram memória permanente.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {notice && (
        <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Auditoria operacional</h3></div>
              <Button type="button" size="sm" variant="outline" onClick={runAudit} disabled={auditBusy} className="gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${auditBusy ? "animate-spin" : ""}`} /> {auditBusy ? "Auditando..." : "Executar agora"}</Button>
            </div>
            <p className="text-sm text-muted-foreground">Verifica briefings vazios, Jobs sem subtarefas, inconsistências de fluxo, indicadores divergentes e gargalos. A auditoria só aponta problemas; não altera Jobs.</p>
            {auditLoading ? <div className="flex min-h-20 items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div> : auditRuns.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma auditoria executada ainda.</div> : <>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Última execução</p><p className="mt-1 text-sm font-semibold">{formatDate(auditRuns[0].finished_at || auditRuns[0].started_at)}</p></div>
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Achados</p><p className="mt-1 text-sm font-semibold">{auditRuns[0].findings_count || 0}</p></div>
                <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 text-sm font-semibold">{auditRuns[0].status === "completed" ? "Concluída" : auditRuns[0].status === "failed" ? "Falhou" : "Em andamento"}</p></div>
              </div>
              {auditFindings.length > 0 && <div className="space-y-2">{auditFindings.slice(0, 12).map((finding) => <div key={finding.id} className={`rounded-lg border p-3 ${severityClass(finding.severity)}`}><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold">{finding.title}</p><span className="text-[10px] font-bold uppercase">{finding.severity}</span></div><p className="mt-1 text-xs">{finding.description}</p><p className="mt-2 text-xs font-medium">Próxima ação: {finding.suggested_action}</p></div>)}</div>}
            </>}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold">Aguardando aprovação ({pending.length})</h3>
            </div>
            {pending.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhum aprendizado aguardando revisão.</div>
            ) : (
              <div className="space-y-3">
                {pending.map((item) => {
                  const draft = drafts[item.id] || {};
                  const busy = processing?.endsWith(`:${item.id}`);
                  return (
                    <article key={item.id} className="rounded-xl border bg-card p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.memory_key || "Regra sem chave"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Proposto em {formatDate(item.proposed_at)} · {scopeLabel(item.scope, item.scope_id)}</p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">Revisão necessária</span>
                      </div>
                      <label className="mt-4 block text-xs font-semibold text-muted-foreground">
                        Regra que será usada pelo Dominus
                        <textarea value={draft.rule || ""} onChange={(event) => updateDraft(item.id, "rule", event.target.value)} rows={3} className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" />
                      </label>
                      <label className="mt-3 block text-xs font-semibold text-muted-foreground">
                        Justificativa
                        <textarea value={draft.rationale || ""} onChange={(event) => updateDraft(item.id, "rationale", event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal text-foreground" />
                      </label>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-muted-foreground">Escopo<select value={draft.scope || "agency"} onChange={(event) => updateDraft(item.id, "scope", event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground"><option value="agency">Agência</option><option value="team">Equipe</option><option value="user">Usuário</option><option value="group">Grupo</option></select></label>
                        {draft.scope && draft.scope !== "agency" && <label className="text-xs font-semibold text-muted-foreground">Identificador do escopo<input value={draft.scope_id || ""} onChange={(event) => updateDraft(item.id, "scope_id", event.target.value)} placeholder="ID do usuário, equipe ou grupo" className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground" /></label>}
                      </div>
                      {item.rationale && <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground"><strong>Contexto:</strong> {item.rationale}</p>}
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => process("reject", item, { note: "Rejeitado pelo Master" })} disabled={busy} className="gap-1.5"><ShieldX className="h-3.5 w-3.5" /> Rejeitar</Button>
                        <Button type="button" size="sm" onClick={() => process("approve", item, draft)} disabled={busy || !String(draft.rule || "").trim()} className="gap-1.5"><Check className="h-3.5 w-3.5" /> {busy ? "Salvando..." : "Aprovar regra"}</Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Memórias ativas ({activeMemories.length})</h3></div>
            {activeMemories.length === 0 ? <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma regra permanente aprovada.</div> : <div className="space-y-2">{activeMemories.map((memory) => <div key={memory.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"><div className="min-w-0"><p className="text-sm font-medium">{memory.rule}</p><p className="mt-1 text-xs text-muted-foreground">{memory.memory_key} · {scopeLabel(memory.scope, memory.scope_id)} · versão {memory.version} · aprovada em {formatDate(memory.approved_at)}</p></div><Button type="button" size="sm" variant="outline" onClick={() => revert(memory)} disabled={processing === `revert:${memory.id}`} className="shrink-0 gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> {processing === `revert:${memory.id}` ? "Revertendo..." : "Reverter"}</Button></div>)}</div>}
          </section>
        </>
      )}
    </div>
  );
}
