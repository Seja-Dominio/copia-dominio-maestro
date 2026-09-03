import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Settings, Check, AlertCircle, ChevronDown, Users, X } from "lucide-react";

// ---- Single send mode ----
function SingleSend({ clients }) {
  const [selectedClient, setSelectedClient] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [groupIdInput, setGroupIdInput] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filteredClients = clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));

  const handleSaveGroupId = async (client) => {
    setSavingGroup(true);
    await base44.entities.Client.update(client.id, { whatsapp_group_id: groupIdInput.trim() });
    setEditingGroupId(null);
    setSavingGroup(false);
    setSelectedClient({ ...client, whatsapp_group_id: groupIdInput.trim() });
  };

  const handleSend = async () => {
    if (!selectedClient?.whatsapp_group_id) {
      setStatus({ type: "error", text: "Configure o ID do grupo WhatsApp deste cliente primeiro." });
      return;
    }
    if (!message.trim()) return;
    setSending(true);
    setStatus(null);
    try {
      const res = await base44.functions.invoke("sendWhatsapp", { phone: selectedClient.whatsapp_group_id, message: message.trim() });
      if (res.data?.success) { setStatus({ type: "success", text: "Mensagem enviada!" }); setMessage(""); }
      else setStatus({ type: "error", text: res.data?.error || "Erro ao enviar." });
    } catch (e) {
      setStatus({ type: "error", text: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Client selector */}
      <div className="glass-card p-5">
        <label className="text-sm font-semibold text-foreground block mb-2">Cliente</label>
        <div className="relative">
          <button onClick={() => { setDropdownOpen(o => !o); setSearch(""); }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-input bg-background text-sm hover:border-ring transition-colors">
            <span className={selectedClient ? "text-foreground" : "text-muted-foreground"}>
              {selectedClient ? selectedClient.name : "Selecionar cliente..."}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>
          {dropdownOpen && (
            <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
              <div className="p-2 border-b border-border">
                <Input autoFocus placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="max-h-52 overflow-y-auto">
                {filteredClients.map(c => (
                  <button key={c.id} onClick={() => { setSelectedClient(c); setDropdownOpen(false); setSearch(""); setStatus(null); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors">
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                      {c.name?.[0]?.toUpperCase()}
                    </div>
                    <span className="flex-1 font-medium text-foreground">{c.name}</span>
                    {!c.whatsapp_group_id && <span className="text-xs text-amber-600 font-medium">sem grupo</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedClient && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grupo WhatsApp</span>
              {editingGroupId !== selectedClient.id && (
                <button onClick={() => { setEditingGroupId(selectedClient.id); setGroupIdInput(selectedClient.whatsapp_group_id || ""); }}
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Settings className="w-3 h-3" /> Configurar
                </button>
              )}
            </div>
            {editingGroupId === selectedClient.id ? (
              <div className="flex gap-2">
                <Input value={groupIdInput} onChange={e => setGroupIdInput(e.target.value)} placeholder="Ex: 120363xxxxxx@g.us" className="h-8 text-xs flex-1" />
                <Button size="sm" onClick={() => handleSaveGroupId(selectedClient)} disabled={savingGroup} className="h-8 text-xs">{savingGroup ? "..." : "Salvar"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingGroupId(null)} className="h-8 text-xs">Cancelar</Button>
              </div>
            ) : (
              <p className="text-sm font-mono">{selectedClient.whatsapp_group_id || <span className="text-muted-foreground italic">Não configurado</span>}</p>
            )}
          </div>
        )}
      </div>

      {selectedClient && (
        <div className="glass-card p-5">
          <label className="text-sm font-semibold text-foreground block mb-2">Mensagem</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            placeholder={`Escreva a mensagem para o grupo de ${selectedClient.name}...`}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            rows={5} onKeyDown={e => e.key === "Enter" && e.ctrlKey && handleSend()} />
          <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter para enviar</p>
          {status && (
            <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {status.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {status.text}
            </div>
          )}
          <div className="flex justify-end mt-3">
            <Button onClick={handleSend} disabled={sending || !message.trim()} className="gap-2">
              <Send className="w-4 h-4" /> {sending ? "Enviando..." : "Enviar no WhatsApp"}
            </Button>
          </div>
        </div>
      )}

      {!selectedClient && (
        <div className="text-center py-12">
          <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Selecione um cliente para enviar mensagem</p>
        </div>
      )}
    </div>
  );
}

// ---- Bulk send mode ----
function BulkSend({ clients }) {
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]); // {name, status, error}
  const [search, setSearch] = useState("");

  const withGroup = clients.filter(c => c.whatsapp_group_id);
  const filtered = withGroup.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  };

  const toggleClient = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkSend = async () => {
    if (!message.trim() || selected.size === 0) return;
    setSending(true);
    setResults([]);
    const toSend = clients.filter(c => selected.has(c.id));
    const res = [];
    for (const client of toSend) {
      try {
        const r = await base44.functions.invoke("sendWhatsapp", { phone: client.whatsapp_group_id, message: message.trim() });
        res.push({ name: client.name, status: r.data?.success ? "ok" : "error", error: r.data?.error });
      } catch (e) {
        res.push({ name: client.name, status: "error", error: e.message });
      }
    }
    setResults(res);
    setSending(false);
  };

  return (
    <div className="space-y-5">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-semibold text-foreground">Selecionar Clientes</label>
          <button onClick={toggleAll} className="text-xs text-primary hover:underline font-semibold">
            {selected.size === filtered.length && filtered.length > 0 ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>
        <Input placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm mb-3" />
        {withGroup.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente com grupo WhatsApp configurado</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {filtered.map(c => (
              <button key={c.id} onClick={() => toggleClient(c.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${selected.has(c.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected.has(c.id) ? "bg-primary border-primary" : "border-border"}`}>
                  {selected.has(c.id) && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                  {c.name?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground flex-1">{c.name}</span>
              </button>
            ))}
          </div>
        )}
        {selected.size > 0 && (
          <p className="text-xs text-primary font-semibold mt-3">{selected.size} cliente(s) selecionado(s)</p>
        )}
      </div>

      <div className="glass-card p-5">
        <label className="text-sm font-semibold text-foreground block mb-2">Mensagem</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Mensagem que será enviada para todos os grupos selecionados..."
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={5} />
        <div className="flex justify-end mt-3">
          <Button onClick={handleBulkSend} disabled={sending || !message.trim() || selected.size === 0} className="gap-2">
            <Send className="w-4 h-4" /> {sending ? "Enviando..." : `Enviar para ${selected.size} grupo(s)`}
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="glass-card p-5">
          <p className="text-sm font-semibold text-foreground mb-3">Resultado do Envio</p>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${r.status === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {r.status === "ok" ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                <span className="font-medium">{r.name}</span>
                {r.error && <span className="text-xs opacity-75">— {r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main page ----
export default function Conversations() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("single"); // "single" | "bulk"

  useEffect(() => {
    base44.entities.Client.filter({ status: "active" }, "name", 200).then(data => {
      setClients(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conversas</h1>
          <p className="text-sm text-muted-foreground mt-1">Envie mensagens WhatsApp para grupos de clientes via Z-API</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button onClick={() => setMode("single")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mode === "single" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <MessageSquare className="w-3.5 h-3.5" /> Individual
          </button>
          <button onClick={() => setMode("bulk")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mode === "bulk" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Users className="w-3.5 h-3.5" /> Envio em Massa
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Carregando clientes...</p>
        </div>
      ) : mode === "single" ? (
        <SingleSend clients={clients} />
      ) : (
        <BulkSend clients={clients} />
      )}
    </div>
  );
}