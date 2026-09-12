import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, X, Send, Loader2, Wand2 } from "lucide-react";

const SUGGESTIONS = [
  "Preencher briefing de um job",
  "Como criar um novo projeto?",
  "Como funciona o timesheet?",
  "Como cadastrar um cliente?",
];

export default function AIAssistant({ currentPage }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Olá! Sou o assistente da AgênciaOS 👋\nPosso te ajudar a navegar pelo sistema e também preencher briefings de jobs automaticamente. O que deseja fazer?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    const lowerMsg = msg.toLowerCase();
    const isBriefingRequest = lowerMsg.includes("briefing") && (lowerMsg.includes("preencher") || lowerMsg.includes("criar") || lowerMsg.includes("gerar") || lowerMsg.includes("escrever"));

    if (isBriefingRequest) {
      // Try to extract job title from message or ask for it
      const jobTitleMatch = msg.match(/(?:job|para|título|titulo)[:\s]+["']?([^"'\n]+?)["']?(?:\s|$)/i);
      const jobTitle = jobTitleMatch?.[1]?.trim();

      if (!jobTitle) {
        // Ask for job title
        setMessages(prev => [...prev, { role: "assistant", content: "Para gerar o briefing, me informe o **título do job**. Por exemplo: \"Gerar briefing para o job: Post Feed - Produto X\"" }]);
        setLoading(false);
        return;
      }

      // Generate briefing via LLM
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um especialista em marketing digital de uma agência. Crie um briefing profissional e detalhado para o job com o título: "${jobTitle}".

O briefing deve incluir:
- Objetivo do conteúdo
- Público-alvo
- Tom de voz
- Mensagem principal
- Referências visuais sugeridas
- Call to action
- Observações importantes

Seja específico e prático. Formato: texto corrido, máximo 200 palavras.`,
      });

      // Try to find and update the job
      const jobs = await base44.entities.Job.list("-created_date", 100);
      const matchingJob = jobs.find(j =>
        j.title.toLowerCase().includes(jobTitle.toLowerCase()) ||
        jobTitle.toLowerCase().includes(j.title.toLowerCase())
      );

      if (matchingJob) {
        await base44.entities.Job.update(matchingJob.id, { briefing: response });
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `✅ Briefing gerado e salvo no job **"${matchingJob.title}"**!\n\n${response}`
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Briefing gerado! Não encontrei um job com esse título exato para salvar automaticamente. Copie e cole manualmente:\n\n${response}`
        }]);
      }
      setLoading(false);
      return;
    }

    // Regular assistant response
    const history = messages.map(m => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`).join("\n");
    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `Você é um assistente especializado no sistema AgênciaOS, uma plataforma de gestão para agências de marketing digital.

O sistema tem: Dashboard, Projetos, Jobs, Propostas, Produção, Mídia, Financeiro, Conversas, Cadastros, Relatórios e Templates.

Funcionalidades principais:
- Projetos: agrupam jobs de um cliente. Clique em um projeto para ver seus jobs.
- Jobs: unidades de trabalho (posts, reels, stories, vídeos). Cada job tem subtarefas, briefing, timesheet e comentários.
- Timesheet: acumula tempo gasto em cada job para relatórios. Timer inicia automaticamente ao abrir o job.
- Kanban: arraste jobs entre colunas para mudar status. Mover para "Concluído" completa todas subtarefas.
- Sons ambiente: clique no ícone de volume no topo para ativar chuva, floresta, oceano, café ou lareira.
- Templates: reutilize configurações de jobs/projetos.
- Financeiro: controle de receitas, despesas e top clientes.

Posso também preencher briefings de jobs! Basta pedir: "Gerar briefing para o job: [título]"

Página atual: ${currentPage}

Histórico:
${history}

Usuário: ${msg}

Responda de forma concisa e prática, em português. Use bullet points quando listar passos. Máximo 150 palavras.`,
    });

    setMessages(prev => [...prev, { role: "assistant", content: response }]);
    setLoading(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
      <div className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "520px" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-primary text-primary-foreground flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Assistente AgênciaOS</p>
                <p className="text-[10px] opacity-80">Pode preencher briefings automaticamente</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: 0 }}>
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {messages.length === 1 && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    {s.includes("briefing") && <Wand2 className="w-2.5 h-2.5" />}
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-border p-3 flex gap-2 flex-shrink-0">
              <input
                className="flex-1 h-9 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Pergunte ou peça para preencher briefing..."
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
  );
}