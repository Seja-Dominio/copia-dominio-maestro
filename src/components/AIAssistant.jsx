import { useState, useRef, useEffect } from "react";
import { maestro } from "@/api/maestroClient";
import { askMaestroAI } from "@/api/supabaseClient";
import { Sparkles, Send, Loader2, Wand2 } from "lucide-react";

const DEFAULT_SUGGESTIONS = [
  "Criar briefing para este job",
  "Criar legenda para este job",
  "Como criar um novo projeto?",
];

function renderAssistantContent(content) {
  const lines = String(content || "").split("\n");
  const firstTableLine = lines.findIndex(line => line.trim().startsWith("|"));
  const tableLines = lines.filter(line => line.trim().startsWith("|") && !/^\s*\|?\s*:?-+/.test(line));
  if (tableLines.length >= 2) {
    const before = lines.slice(0, firstTableLine).join("\n").trim();
    return <>{before && <div className="mb-3 whitespace-pre-line">{before}</div>}<div className="overflow-x-auto -mx-1 rounded-lg border border-border"><table className="w-full min-w-[720px] text-xs border-collapse"><thead><tr>{tableLines[0].split("|").slice(1, -1).map((cell, index) => <th key={index} className="bg-primary/10 text-primary text-left p-2 border-b border-border">{cell.trim()}</th>)}</tr></thead><tbody>{tableLines.slice(1).map((line, rowIndex) => <tr key={rowIndex}>{line.split("|").slice(1, -1).map((cell, index) => <td key={index} className="p-2 align-top border-b border-border whitespace-pre-wrap">{cell.trim()}</td>)}</tr>)}</tbody></table></div></>;
  }
  return content;
}

export default function AIAssistant({ currentPage }) {
  const [activeJob, setActiveJob] = useState(() => window.__maestroActiveJob || null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [externalDrawerOpen, setExternalDrawerOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Olá! Sou o ChatGPT do Maestro 👋\nPodemos conversar normalmente sobre o sistema, analisar este job ou criar um briefing e uma legenda. As ações de briefing e legenda só acontecem quando você pedir explicitamente. O que deseja fazer?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const isReelsJob = /\breels?\b/i.test(`${activeJob?.title || ""} ${activeJob?.format || ""} ${activeJob?.type || ""}`);
  const suggestions = isReelsJob
    ? ["Criar roteiro para este job", "Criar legenda para este job", "Como criar um novo projeto?"]
    : DEFAULT_SUGGESTIONS;

  async function handleGeneratedMaterial(material, messageIndex) {
    if (!material?.jobTitle) return;
    setLoading(true);
    try {
      const jobs = await maestro.entities.Job.list("-created_date", 100);
      const normalizedTitle = String(material.jobTitle || "").toLowerCase().trim();
      const matchingJob = jobs.find(j => (activeJob?.id && j.id === activeJob.id) ||
        String(j.title || "").toLowerCase().trim() === normalizedTitle ||
        (normalizedTitle !== "este" && String(j.title || "").toLowerCase().includes(normalizedTitle)));
      if (!matchingJob) throw new Error("Não encontrei o job para salvar o material.");
      const captionMatch = material.content.match(/(?:^|\n)\s*(?:7\.\s*)?Legenda sugerida\s*[:\-]?\s*\n?([\s\S]*)$/i);
      if (material.kind === "script") {
        const projects = await maestro.entities.Project.list("-created_date", 500);
        const project = projects.find(item => item.id === matchingJob.project_id);
        const existing = project?.scripts_document ? `${project.scripts_document}\n\n` : "";
        const entry = `ROTEIRO DE REEL\n${matchingJob.title}\nData de postagem: ${matchingJob.post_date || "A definir"}\nCliente: ${matchingJob.client_name || "A definir"}\nProjeto: ${matchingJob.project_name || "A definir"}\n\n${material.content}`;
        if (!project) throw new Error("Não encontrei o projeto deste job.");
        await maestro.entities.Project.update(project.id, { scripts_document: `${existing}${entry}` });
      }
      const updateData = material.kind === "caption" ? { caption: material.content } : material.kind === "script" ? {} : { briefing: material.content };
      if (material.kind !== "caption" && captionMatch?.[1]?.trim()) updateData.caption = captionMatch[1].trim();
      if (Object.keys(updateData).length) await maestro.entities.Job.update(matchingJob.id, updateData);
      setMessages(prev => prev.map((item, index) => index === messageIndex ? { ...item, pending: null, content: `✅ Material usado no job **"${matchingJob.title}"**. Briefing/roteiro e legenda foram preenchidos nos campos destinados.\n\n${material.content}` } : item));
    } catch (error) {
      setMessages(prev => [...prev, { role: "assistant", content: error.message || "Não foi possível salvar o material." }]);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleJob = event => setActiveJob(event.detail || null);
    window.addEventListener("maestro:active-job", handleJob);
    const handleDrawer = event => {
      const source = event.detail?.source;
      if (source === "tasks") {
        setOpen(false);
        setTasksOpen(Boolean(event.detail.open));
        setExternalDrawerOpen(Boolean(event.detail.open));
      } else if (source !== "chatgpt") {
        setOpen(false);
        setTasksOpen(false);
        setExternalDrawerOpen(Boolean(event.detail?.open));
      }
    };
    window.addEventListener("maestro:drawer-state", handleDrawer);
    return () => { window.removeEventListener("maestro:active-job", handleJob); window.removeEventListener("maestro:drawer-state", handleDrawer); };
  }, []);

  function toggleAssistant() {
    const next = !open;
    setOpen(next);
    window.dispatchEvent(new CustomEvent("maestro:drawer-state", { detail: { source: "chatgpt", open: next } }));
  }

  async function sendMessage(text) {
    const msg = text || input.trim();
    if (!msg) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    const lowerMsg = msg.toLowerCase();
    const isReelsJob = /\breels?\b/i.test(`${activeJob?.title || ""} ${activeJob?.format || ""} ${activeJob?.type || ""}`);
    const isScriptRequest = isReelsJob && (lowerMsg.includes("roteiro") || lowerMsg.includes("script")) && (lowerMsg.includes("criar") || lowerMsg.includes("gerar") || lowerMsg.includes("fazer") || lowerMsg.includes("escrever"));
    const isCaptionRequest = lowerMsg.includes("legenda") && (lowerMsg.includes("criar") || lowerMsg.includes("gerar") || lowerMsg.includes("fazer") || lowerMsg.includes("escrever"));
    const isBriefingRequest = !isScriptRequest && !isCaptionRequest && lowerMsg.includes("briefing") && (lowerMsg.includes("preencher") || lowerMsg.includes("criar") || lowerMsg.includes("gerar") || lowerMsg.includes("escrever"));

    if (isBriefingRequest || isScriptRequest) {
      // Try to extract job title from message or ask for it
      const jobTitleMatch = msg.match(/(?:job|para|título|titulo)[:\s]+["']?([^"'\n]+?)["']?(?:\s|$)/i);
      const jobTitle = jobTitleMatch?.[1]?.trim() || activeJob?.title;

      if (!jobTitle) {
        // Ask for job title
        setMessages(prev => [...prev, { role: "assistant", content: "Para gerar o briefing, me informe o **título do job**. Por exemplo: \"Gerar briefing para o job: Post Feed - Produto X\"" }]);
        setLoading(false);
        return;
      }

      const deliverable = isScriptRequest ? "roteiro de Reel" : isCaptionRequest ? "legenda" : "briefing";
      // Generate the requested deliverable via LLM
      const response = await askMaestroAI({
        message: isCaptionRequest
          ? `Crie uma legenda para o job "${jobTitle}" do cliente "${activeJob?.client_name || "A definir"}". Use o contexto disponível no Maestro sobre o cliente, com linguagem natural, benefício claro, CTA quando fizer sentido, emojis coerentes e hashtags relevantes. Retorne somente a legenda pronta para publicação.`
          : isScriptRequest
          ? `Você é o ChatGPT editorial da agência. Crie um roteiro de Reel para o job "${jobTitle}" considerando o cliente "${activeJob?.client_name || "A definir"}" e o projeto "${activeJob?.project_name || "A definir"}". Use o conhecimento disponível no Maestro sobre o cliente, sem inventar fatos.

O título deve seguir: Roteiro — Reels | ${jobTitle} — ${activeJob?.client_name || "Cliente"}.
Depois do título, retorne EXATAMENTE uma tabela Markdown com estas quatro colunas, nesta ordem: Tempo | Cena | Fala / Narração | Texto na Tela.
Cada linha deve representar um intervalo de tempo, com cenas específicas, fala/narração completa e texto de tela. Use o padrão de duração de aproximadamente 30 segundos, dividido em blocos (0–3s, 4–7s, 8–12s, 13–17s, 18–22s, 23–27s, 28–30s).

REGRA OBRIGATÓRIA: não escreva texto corrido, tópicos, subtítulos, “Cena 1”, “Cena 2”, seções de texto/fala ou explicações fora da tabela. Não use listas com hífen. A resposta inteira deve ser apenas o título e a tabela Markdown com as quatro colunas solicitadas.`
          : `Você é o ChatGPT editorial da agência. Crie o briefing do job "${jobTitle}" considerando o cliente "${activeJob?.client_name || "A definir"}" e o projeto "${activeJob?.project_name || "A definir"}".

Use como base todo o conhecimento disponível no contexto do Maestro sobre esse cliente, incluindo posicionamento, público, produtos, tom de voz, diferenciais e padrões já usados. Não misture informações de outros clientes e não invente fatos; quando faltar informação, escreva "A definir".

Siga exatamente esta estrutura:

1. Objetivo
2. Formato (identifique o formato correto e informe a dimensão: Feed 1350x1080, Story 1920x1080, Reels 1080x1920, YouTube 1920x1080 ou outro formato adequado)
3. Mensagem principal
4. Headline
5. Texto de apoio
6. Direcionamento visual
7. Legenda sugerida

Na legenda, use uma linguagem natural, comercial e específica para o cliente. Estruture em parágrafos curtos, com emojis apenas quando combinarem com o tom da marca, CTA claro quando fizer sentido e hashtags relevantes no final. Como referência de estilo: apresentar o benefício, conectar com a necessidade do público, citar o produto/serviço e encerrar com um convite para ação.

Retorne somente os sete campos numerados, sem introdução ou conclusão.`,
        context: {
          page: currentPage,
          task: deliverable,
          job: activeJob,
          client: { id: activeJob?.client_id, name: activeJob?.client_name },
        },
      });

      if (!response || response.startsWith("A integração") || response.startsWith("Não foi possível") || response.startsWith("Erro ao")) {
        setMessages(prev => [...prev, { role: "assistant", content: response || "Não foi possível gerar o briefing agora." }]);
        setLoading(false);
        return;
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        content: `${isScriptRequest ? "Roteiro" : isCaptionRequest ? "Legenda" : "Briefing"} gerado para **"${jobTitle}"**.\n\n${response}`,
        pending: { content: response, jobTitle, kind: isCaptionRequest ? "caption" : isScriptRequest ? "script" : "briefing" },
      }]);
      setLoading(false);
      return;
    }

    // Regular assistant response: conversational, with the current job as context.
    const history = messages.map(m => `${m.role === "user" ? "Usuário" : "Assistente"}: ${m.content}`).join("\n");
    const response = await askMaestroAI({
      message: `Você é um assistente especializado no sistema AgênciaOS, uma plataforma de gestão para agências de marketing digital.

O sistema tem: Dashboard, Projetos, Jobs, Propostas, Produção, Mídia, Financeiro, Conversas, Cadastros, Relatórios e Templates.

Funcionalidades principais:
- Projetos: agrupam jobs de um cliente. Clique em um projeto para ver seus jobs.
- Jobs: unidades de trabalho (posts, reels, stories, vídeos). Cada job tem subtarefas, briefing, timesheet e comentários.
- Timesheet: acumula tempo gasto em cada job para relatórios. Timer inicia automaticamente ao abrir o job.
- Kanban: arraste jobs entre colunas para mudar status. Mover para "Concluído" completa todas subtarefas.
- Sons ambiente: clique no ícone de volume no topo para ativar chuva, floresta, oceano, café ou lareira.
- Templates: reutilize configurações de jobs/projetos.
- Financeiro: controle de receitas, despesas e top clientes.

Só preencho ou salvo briefing quando você pedir explicitamente, por exemplo: "Gerar briefing para o job: [título]".

Página atual: ${currentPage}

Histórico:
${history}

Usuário: ${msg}

Responda de forma concisa e prática, em português. Use bullet points quando listar passos. Máximo 150 palavras.`,
      context: { page: currentPage, task: "general", job: activeJob },
    });

    setMessages(prev => [...prev, { role: "assistant", content: response }]);
    setLoading(false);
  }

  if (externalDrawerOpen) return null;

  if (!open && !tasksOpen) {
    return (
      <button
        type="button"
        onClick={toggleAssistant}
        aria-label="Abrir ChatGPT"
        title="Abrir ChatGPT"
        className="fixed bottom-6 right-20 z-[10050] w-14 h-14 rounded-full bg-[radial-gradient(circle_at_50%_35%,#ffffff_0%,#dce7ff_24%,#8ea4ff_52%,#536dff_78%,#273baf_100%)] text-white shadow-[0_0_22px_rgba(102,126,255,0.75),0_0_48px_rgba(102,126,255,0.35)] flex items-center justify-center hover:scale-105 hover:shadow-[0_0_28px_rgba(102,126,255,0.9),0_0_58px_rgba(102,126,255,0.45)] transition-all duration-200 border border-white/40"
      >
        <Sparkles className="w-6 h-6 drop-shadow-[0_1px_2px_rgba(30,45,120,0.5)]" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[10050]" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("maestro:drawer-state", { detail: { source: "chatgpt", open: false } })); }}>
      <div className="fixed top-[60px] bottom-[10px] right-[40px] z-[10060] w-[min(41vw,720px)] min-w-[360px] max-sm:min-w-0 max-sm:w-[92vw] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-primary text-primary-foreground flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">ChatGPT no Maestro</p>
                <p className="text-[10px] opacity-80">Análises, legendas e briefings</p>
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
                    {renderAssistantContent(m.content)}
                    {m.pending && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                        <button onClick={() => handleGeneratedMaterial(m.pending, i)} className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">Usar este material</button>
                        <button onClick={() => setMessages(prev => prev.map((item, index) => index === i ? { ...item, pending: null, content: `${item.content}\n\nMaterial mantido apenas na conversa.` } : item))} className="px-2.5 py-1 rounded-lg bg-background text-foreground border border-border text-xs font-semibold">Continuar</button>
                      </div>
                    )}
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
                {suggestions.map(s => (
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
