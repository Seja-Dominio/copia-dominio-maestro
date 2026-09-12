import { useCallback, useEffect, useRef, useState } from "react";
import { Hash, Loader2, MessageSquare, RefreshCw, Reply, Send, Smile, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeMaestroFunction } from "@/api/maestroClient";

const QUICK_REACTIONS = ["👍", "✅", "❤️", "😂"];

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isGrouped(previous, message) {
  if (!previous || previous.author_id !== message.author_id) return false;
  return new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60 * 1000;
}

function MessageBubble({ message, previous, onReply, onReaction }) {
  const grouped = isGrouped(previous, message);
  const reactions = Array.isArray(message.reactions) ? message.reactions : [];
  const replyMessage = message.reply_to_id && previous?.id === message.reply_to_id ? previous : null;

  return (
    <div className={`group flex gap-3 px-4 py-1.5 ${grouped ? "pt-0.5" : "pt-3"}`}>
      <div className="w-8 flex-shrink-0">
        {!grouped && <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{message.author?.name?.[0]?.toUpperCase() || "?"}</span>}
      </div>
      <div className="min-w-0 max-w-[min(44rem,calc(100%-3rem))]">
        {!grouped && <div className="mb-1 flex items-baseline gap-2"><span className="text-sm font-semibold text-foreground">{message.author?.name || "Colaborador"}</span><span className="text-[11px] text-muted-foreground">{formatTime(message.created_at)}</span></div>}
        {replyMessage && <div className="mb-1 rounded border-l-2 border-primary/40 bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">Respondendo a {replyMessage.author?.name}: {replyMessage.content.slice(0, 100)}</div>}
        <div className="relative rounded-2xl rounded-tl-md bg-muted/65 px-3.5 py-2 text-sm leading-6 text-foreground">
          {message.content}
          {grouped && <span className="ml-2 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{formatTime(message.created_at)}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {reactions.map((reaction) => <button type="button" key={reaction.emoji} onClick={() => onReaction(message.id, reaction.emoji)} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs hover:border-primary hover:bg-primary/5" aria-label={`Remover reação ${reaction.emoji}`}>{reaction.emoji} {reaction.count}</button>)}
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {QUICK_REACTIONS.filter((emoji) => !reactions.some((reaction) => reaction.emoji === emoji)).slice(0, 2).map((emoji) => <button type="button" key={emoji} onClick={() => onReaction(message.id, emoji)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-primary" aria-label={`Reagir com ${emoji}`}><span className="text-xs">{emoji}</span></button>)}
            <button type="button" onClick={() => onReply(message)} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-primary" aria-label="Responder"><Reply className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamChatPanel() {
  const [channels, setChannels] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState("");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);
  const endOfMessagesRef = useRef(null);
  const loadBootstrap = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await invokeMaestroFunction("teamChat", { action: "bootstrap" });
      const data = result.data || {};
      setChannels(data.channels || []);
      setCollaborators(data.collaborators || []);
      setActiveChannelId((current) => current || data.activeChannelId || data.channels?.[0]?.id || "");
      setMessages(data.messages || []);
      setNotice(null);
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível carregar a comunicação da equipe." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMessages = useCallback(async (channelId, quiet = true) => {
    if (!channelId) return;
    if (!quiet) setLoading(true);
    try {
      const result = await invokeMaestroFunction("teamChat", { action: "listMessages", channelId });
      setMessages(result.data?.messages || []);
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível atualizar as mensagens." });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => { loadBootstrap(); }, [loadBootstrap]);

  useEffect(() => {
    if (!activeChannelId) return undefined;
    const timer = window.setInterval(() => loadMessages(activeChannelId), 10000);
    return () => window.clearInterval(timer);
  }, [activeChannelId, loadMessages]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeChannelId]);

  const selectChannel = async (channelId) => {
    if (channelId === activeChannelId) return;
    setActiveChannelId(channelId);
    setReplyTo(null);
    await loadMessages(channelId, false);
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || !activeChannelId || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const result = await invokeMaestroFunction("teamChat", { action: "sendMessage", channelId: activeChannelId, content, replyToId: replyTo?.id || undefined });
      if (result.data?.message) setMessages((current) => current.some((item) => item.id === result.data.message.id) ? current : [...current, result.data.message]);
      setDraft("");
      setReplyTo(null);
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível enviar a mensagem." });
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = async (messageId, emoji) => {
    try {
      const result = await invokeMaestroFunction("teamChat", { action: "toggleReaction", messageId, emoji });
      if (result.data?.messages) setMessages(result.data.messages);
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível registrar a reação." });
    }
  };

  const activeChannel = channels.find((channel) => channel.id === activeChannelId);

  if (loading && !channels.length) return <div className="glass-card flex min-h-[28rem] items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando comunicação da equipe...</div>;

  return (
    <div className="grid min-h-[34rem] gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="glass-card overflow-hidden">
        <div className="border-b border-border p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-foreground">Canais da equipe</p><p className="mt-0.5 text-xs text-muted-foreground">Alinhamentos internos</p></div><Users className="h-4 w-4 text-muted-foreground" /></div></div>
        <div className="space-y-1 p-2">
          {channels.map((channel) => <button type="button" key={channel.id} onClick={() => selectChannel(channel.id)} className={`flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${channel.id === activeChannelId ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Hash className="mt-0.5 h-4 w-4 flex-shrink-0" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{channel.name}</span><span className="block truncate text-[11px]">{channel.description}</span></span></button>)}
          {!channels.length && <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nenhum canal disponível.</p>}
        </div>
        <div className="mt-auto border-t border-border p-3 text-[11px] text-muted-foreground"><span className="font-semibold text-foreground">{collaborators.length}</span> colaboradores ativos</div>
      </aside>

      <section className="glass-card flex min-h-[34rem] min-w-0 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3"><div className="flex min-w-0 items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Hash className="h-4 w-4" /></span><div className="min-w-0"><h2 className="truncate text-sm font-bold text-foreground">{activeChannel?.name || "Comunicação"}</h2><p className="truncate text-xs text-muted-foreground">{activeChannel?.description || "Converse com sua equipe"}</p></div></div><Button type="button" variant="ghost" size="sm" onClick={() => loadMessages(activeChannelId, true)} disabled={refreshing} className="gap-1.5 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar</Button></header>
        <div className="min-h-0 flex-1 overflow-y-auto py-3">
          {messages.length ? messages.map((message, index) => <MessageBubble key={message.id} message={message} previous={messages[index - 1]} onReply={setReplyTo} onReaction={toggleReaction} />) : <div className="flex h-full min-h-[22rem] flex-col items-center justify-center px-6 text-center"><MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/30" /><p className="text-sm font-medium text-foreground">Comece a conversa</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">Use este canal para centralizar decisões, dúvidas e alinhamentos da equipe.</p></div>}
          <div ref={endOfMessagesRef} />
        </div>
        <div className="border-t border-border p-3">
          {notice && <div className={`mb-2 rounded-lg px-3 py-2 text-xs ${notice.type === "error" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{notice.text}</div>}
          {replyTo && <div className="mb-2 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><span>Respondendo a <strong className="text-foreground">{replyTo.author?.name}</strong>: {replyTo.content.slice(0, 90)}</span><button type="button" onClick={() => setReplyTo(null)} className="font-semibold text-primary hover:underline">Cancelar</button></div>}
          <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-2 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20"><Smile className="mb-2 ml-1 h-4 w-4 text-muted-foreground" /><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); sendMessage(); } }} rows={2} placeholder={`Mensagem em #${activeChannel?.name || "equipe"}...`} className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground" /><Button type="button" onClick={sendMessage} disabled={sending || !draft.trim() || !activeChannelId} className="h-9 gap-1.5"><Send className="h-4 w-4" />{sending ? "Enviando" : "Enviar"}</Button></div>
          <p className="mt-1 px-1 text-[10px] text-muted-foreground">Ctrl/Cmd + Enter para enviar · Reaja ou responda a qualquer mensagem</p>
        </div>
      </section>
    </div>
  );
}
