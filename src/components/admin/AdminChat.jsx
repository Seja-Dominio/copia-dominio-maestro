import { useState, useRef, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";

const SUGGESTIONS = [
  "Quais clientes têm mais atrasos?",
  "Quais colaboradores estão sem timesheet hoje?",
  "Quais captações estão sem agendamento?",
  "Resumo geral dos jobs ativos",
];

function compactEntity(obj, removeFields = []) {
  if (!obj) return null;
  const copy = {};
  for (const k of Object.keys(obj)) {
    if (removeFields.includes(k)) continue;
    if (obj[k] === null || obj[k] === undefined || obj[k] === "") continue;
    copy[k] = obj[k];
  }
  return copy;
}

export default function AdminChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Olá! Sou o assistente administrativo 🧠\nPosso consultar dados reais do sistema — clientes, jobs, colaboradores, captações, tarefas e mais. O que deseja saber?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchSnapshot = useCallback(async () => {
    const bigFields = ["briefing", "caption", "schedule_data", "password_hash", "attachments", "contacts", "permissions", "dashboard_widgets", "dashboard_layout", "financial_widgets", "financial_layout", "items", "subtasks"];
    
    const [clients, jobs, collaborators, subtasks, events, timesheets] = await Promise.all([
      base44.entities.Client.list("name", 200),
      base44.entities.Job.list("-created_date", 150),
      base44.entities.Collaborator.list("name", 100),
      base44.entities.Subtask.list("-created_date", 300),
      base44.entities.AgendaEvent.list("-date", 200),
      base44.entities.Timesheet.list("-created_date", 300),
    ]);

    return {
      clientes: clients.map(c => compactEntity(c, bigFields)),
      jobs: jobs.map(j => compactEntity(j, bigFields)),
      colaboradores: collaborators.map(c => compactEntity(c, bigFields)),
      subtarefas: subtasks.map(s => compactEntity(s, bigFields)),
      agenda: events.map(e => compactEntity(e, bigFields)),
      timesheets: timesheets.map(t => compactEntity(t, bigFields)),
    };
  }, []);

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const snapshot = await fetchSnapshot();

      const history = messages.slice(-10).map(m =>
        `${m.role === "user" ? "Admin" : "Assistente"}: ${m.content}`
      ).join("\n");

      const today = new Date().toISOString().split("T")[0];

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é o assistente administrativo da agência de marketing "Domínio Performance", integrado ao sistema AgênciaOS.

Você tem acesso aos DADOS REAIS do sistema abaixo. Use APENAS estes dados para responder — nunca invente informações.

DATA DE HOJE: ${today}

=== DADOS DO SISTEMA ===
Clientes (${snapshot.clientes.length}): ${JSON.stringify(snapshot.clientes)}

Jobs (${snapshot.jobs.length}): ${JSON.stringify(snapshot.jobs)}

Colaboradores (${snapshot.colaboradores.length}): ${JSON.stringify(snapshot.colaboradores)}

Subtarefas (${snapshot.subtarefas.length}): ${JSON.stringify(snapshot.subtarefas)}

Agenda/Captações (${snapshot.agenda.length}): ${JSON.stringify(snapshot.agenda)}

Timesheets (${snapshot.timesheets.length}): ${JSON.stringify(snapshot.timesheets)}

=== REGRAS ===
- Job atrasado: post_date <= hoje E status NÃO é completed/scheduled/cancelled
- Subtarefa atrasada: deadline <= hoje E is_completed = false
- Captação pendente: subtarefa com título contendo "captação" ou "captacao" E is_completed = false
- Captação agendada: AgendaEvent com activity_type = captacao ou captacao_imagens E date >= hoje
- Responda SEMPRE em português, de forma concisa e prática
- Use markdown simples (negrito, listas) para organizar
- Máximo 250 palavras
- Cite nomes reais de clientes/colaboradores dos dados
- Se não encontrar a informação nos dados, diga claramente

=== HISTÓRICO ===
${history}

=== PERGUNTA ===
${msg}`,
      });

      setMessages(prev => [...prev, { role: "assistant", content: response }]);
    } catch (err) {
      console.error("Admin chat error:", err);
      setMessages(prev => [...prev, { role: "assistant", content: "Desculpe, houve um erro ao processar sua pergunta. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center"
          aria-label="Abrir assistente admin"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className="fixed inset-0 z-40 md:bg-transparent" onClick={() => setOpen(false)}>
          <div
            className="fixed bottom-0 right-0 md:bottom-6 md:right-6 z-50 w-full md:w-96 bg-card border border-border md:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{ maxHeight: "min(560px, calc(100vh - 80px))" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-primary text-primary-foreground flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Assistente Admin</p>
                <p className="text-[10px] opacity-80">Responde com dados reais do sistema</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 0 }}>
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                    {m.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:m-0 [&_ul]:m-0 [&_ol]:m-0 [&_li]:m-0 text-sm leading-relaxed">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-line">{m.content}</span>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Consultando sistema...</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 2 && !loading && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-border p-3 flex gap-2 flex-shrink-0 safe-bottom">
              <input
                className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Pergunte sobre o sistema..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white disabled:opacity-50 hover:bg-primary/90 transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}