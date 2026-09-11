import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { maestro, invokeMaestroFunction, uploadMaestroFile } from "@/api/maestroClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Settings, Check, AlertCircle, ChevronDown, Users, RefreshCw, QrCode, Copy, ContactRound, X, Loader2, Link2, Paperclip, Trash2, CalendarClock } from "lucide-react";
import WhatsappReportsPanel from "@/components/conversations/WhatsappReportsPanel";

function getClientDestinations(client) {
  const groupIds = Array.isArray(client?.whatsapp_group_ids) ? client.whatsapp_group_ids : [client?.whatsapp_group_id];
  return [...new Set([...groupIds, ...(Array.isArray(client?.whatsapp_contact_ids) ? client.whatsapp_contact_ids : [])].filter(Boolean))];
}

function MediaPicker({ media, onChange, disabled = false }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 50 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadMaestroFile(file);
      if (!uploaded?.file_url) throw new Error("O arquivo não foi carregado.");
      onChange({ name: file.name, type: file.type || "application/octet-stream", url: uploaded.file_url });
    } catch (uploadError) {
      setError(uploadError.message || "Não foi possível anexar a mídia.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary ${disabled || uploading ? "pointer-events-none opacity-60" : ""}`}>
          <Paperclip className="h-3.5 w-3.5" />
          {uploading ? "Carregando mídia..." : "Anexar mídia"}
          <input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleChange} disabled={disabled || uploading} />
        </label>
        <span className="text-[10px] text-muted-foreground">Até 50 MB</span>
      </div>
      {media && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-2 text-xs">
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{media.name}</span>
          <button type="button" onClick={() => onChange(null)} disabled={disabled || uploading} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Remover mídia" aria-label="Remover mídia">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

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
  const [media, setMedia] = useState(null);

  const filteredClients = clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));

  const handleSaveGroupId = async (client) => {
    setSavingGroup(true);
    const groupIds = [...new Set(groupIdInput.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))];
    await maestro.entities.Client.update(client.id, { whatsapp_group_id: groupIds[0] || "", whatsapp_group_ids: groupIds });
    setEditingGroupId(null);
    setSavingGroup(false);
    setSelectedClient({ ...client, whatsapp_group_id: groupIds[0] || "", whatsapp_group_ids: groupIds });
  };

  const handleSend = async () => {
    const destinations = getClientDestinations(selectedClient);
    if (destinations.length === 0) {
      setStatus({ type: "error", text: "Configure um grupo ou contato WhatsApp para este cliente primeiro." });
      return;
    }
    if (!message.trim() && !media) return;
    setSending(true);
    setStatus(null);
    try {
      const failures = [];
      let sent = 0;
      for (const destination of destinations) {
        try {
          const res = media
            ? await invokeMaestroFunction("sendWhatsappFile", { phone: destination, fileUrl: media.url, caption: message.trim(), fileName: media.name, fileType: media.type })
            : await invokeMaestroFunction("sendWhatsapp", { phone: destination, message: message.trim() });
          if (!res.data?.success) throw new Error(res.data?.error || "A Evolution API recusou o envio.");
          sent += 1;
        } catch (error) {
          failures.push(`${destination}: ${error.message || "envio recusado"}`);
        }
      }
      if (failures.length) {
        setStatus({ type: "error", text: `${sent} enviado(s). ${failures.length} recusado(s): ${failures.join("; ")}` });
      } else {
        setStatus({ type: "success", text: media ? "Mídia enviada para todos os destinos!" : "Mensagem enviada para todos os destinos!" });
        setMessage("");
        setMedia(null);
      }
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
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Grupos e contatos WhatsApp</span>
              {editingGroupId !== selectedClient.id && (
                <button onClick={() => { setEditingGroupId(selectedClient.id); setGroupIdInput((selectedClient.whatsapp_group_ids || [selectedClient.whatsapp_group_id]).filter(Boolean).join("\n")); }}
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Settings className="w-3 h-3" /> Configurar
                </button>
              )}
            </div>
            {editingGroupId === selectedClient.id ? (
              <div className="flex gap-2">
                <textarea value={groupIdInput} onChange={e => setGroupIdInput(e.target.value)} placeholder="Um grupo por linha ou separado por vírgula" rows={2} className="min-h-8 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs" />
                <Button size="sm" onClick={() => handleSaveGroupId(selectedClient)} disabled={savingGroup} className="h-8 text-xs">{savingGroup ? "..." : "Salvar"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingGroupId(null)} className="h-8 text-xs">Cancelar</Button>
              </div>
            ) : (
              <p className="whitespace-pre-line text-sm font-mono">{getClientDestinations(selectedClient).length ? getClientDestinations(selectedClient).join("\n") : <span className="text-muted-foreground italic">Não configurado</span>}</p>
            )}
          </div>
        )}
      </div>

      {selectedClient && (
        <div className="glass-card p-5">
          <label className="text-sm font-semibold text-foreground block mb-2">Mensagem</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)}
            placeholder={`Escreva a mensagem para ${selectedClient.name}...`}
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            rows={5} onKeyDown={e => e.key === "Enter" && e.ctrlKey && handleSend()} />
          <MediaPicker media={media} onChange={setMedia} disabled={sending} />
          <p className="text-xs text-muted-foreground mt-1">Ctrl+Enter para enviar</p>
          {status && (
            <div className={`mt-3 flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {status.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {status.text}
            </div>
          )}
          <div className="flex justify-end mt-3">
            <Button onClick={handleSend} disabled={sending || (!message.trim() && !media)} className="gap-2">
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
  const [media, setMedia] = useState(null);

  const withDestination = clients.filter(c => getClientDestinations(c).length > 0);
  const filtered = withDestination.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));

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
    if ((!message.trim() && !media) || selected.size === 0) return;
    setSending(true);
    setResults([]);
    const toSend = clients.filter(c => selected.has(c.id));
    const res = [];
    for (const client of toSend) {
      const failures = [];
      let sent = 0;
      for (const destination of getClientDestinations(client)) {
        try {
          const r = media
            ? await invokeMaestroFunction("sendWhatsappFile", { phone: destination, fileUrl: media.url, caption: message.trim(), fileName: media.name, fileType: media.type })
            : await invokeMaestroFunction("sendWhatsapp", { phone: destination, message: message.trim() });
          if (!r.data?.success) throw new Error(r.data?.error || "A Evolution API recusou o envio.");
          sent += 1;
        } catch (error) {
          failures.push(`${destination}: ${error.message || "envio recusado"}`);
        }
      }
      res.push(failures.length
        ? { name: client.name, status: sent ? "partial" : "error", error: `${sent} enviado(s); ${failures.length} recusado(s): ${failures.join("; ")}` }
        : { name: client.name, status: "ok" });
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
        {withDestination.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente com destino WhatsApp configurado</p>
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
          placeholder="Mensagem que será enviada para todos os destinos selecionados..."
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={5} />
        <MediaPicker media={media} onChange={setMedia} disabled={sending} />
        <div className="flex justify-end mt-3">
          <Button onClick={handleBulkSend} disabled={sending || (!message.trim() && !media) || selected.size === 0} className="gap-2">
            <Send className="w-4 h-4" /> {sending ? "Enviando..." : `Enviar para ${selected.size} cliente(s)`}
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

function WhatsAppConnectionManager({ open, onClose, connection, onConnectionChanged, clients, onClientsChanged }) {
  const [qrCode, setQrCode] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [groups, setGroups] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState(null);
  const [directorySearch, setDirectorySearch] = useState("");
  const [targetClientId, setTargetClientId] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState(new Set());
  const [savingLinks, setSavingLinks] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!open) return;
    setQrCode(null);
    setNotice(null);
    loadDirectory(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    window.dispatchEvent(new CustomEvent("maestro:drawer-state", { detail: { source: "whatsapp", open: true } }));
    return () => window.dispatchEvent(new CustomEvent("maestro:drawer-state", { detail: { source: "whatsapp", open: false } }));
  }, [open]);

  const connectNumber = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const result = await invokeMaestroFunction("whatsappConnect", {});
      const data = result.data || {};
      setQrCode(data.qrCode || null);
      onConnectionChanged({
        loading: false,
        connected: Boolean(data.connected),
        state: data.state || (data.connected ? "open" : "connecting"),
        error: data.error || null,
      });
      if (data.connected) setNotice({ type: "success", text: "O número já está conectado." });
      else if (!data.qrCode) setNotice({ type: "info", text: data.error || "O QR Code ainda não foi disponibilizado. Tente atualizar em alguns segundos." });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível iniciar a conexão." });
    } finally {
      setConnecting(false);
    }
  };

  const loadDirectory = async (sync = true) => {
    setDirectoryLoading(true);
    setDirectoryError(null);
    try {
      const [groupsResult, contactsResult] = await Promise.allSettled(sync ? [
        invokeMaestroFunction("syncWhatsappDirectory", {}),
      ] : [invokeMaestroFunction("listWhatsappDirectory", {})]);
      const result = groupsResult.status === "fulfilled" ? groupsResult.value : null;
      if (result) {
        setGroups(result.data?.groups || []);
        setContacts(result.data?.contacts || []);
      }
      const errors = [groupsResult, contactsResult].filter((item) => item && item.status === "rejected");
      if (errors.length) throw errors[0].reason;
    } catch (error) {
      setDirectoryError(error.message || "Não foi possível carregar grupos e contatos.");
    } finally {
      setDirectoryLoading(false);
    }
  };

  const copyId = async (id) => {
    try {
      await navigator.clipboard.writeText(id);
      setNotice({ type: "success", text: "ID copiado." });
    } catch {
      setNotice({ type: "info", text: `ID: ${id}` });
    }
  };

  const saveLinks = async () => {
    const client = clients.find((item) => item.id === targetClientId);
    if (!client) {
      setNotice({ type: "info", text: "Selecione um cliente para salvar os vínculos." });
      return;
    }
    setSavingLinks(true);
    try {
      const result = await invokeMaestroFunction("linkWhatsappClient", {
        clientId: client.id,
        groupId: [...selectedGroupIds][0] || null,
        groupIds: [...selectedGroupIds],
        contactIds: [...selectedContactIds],
      });
      const updated = result.data?.client || { ...client, whatsapp_group_id: [...selectedGroupIds][0] || "", whatsapp_group_ids: [...selectedGroupIds], whatsapp_contact_ids: [...selectedContactIds] };
      onClientsChanged(clients.map((item) => item.id === client.id ? updated : item));
      setNotice({ type: "success", text: `Vínculos salvos para ${client.name}.` });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Não foi possível vincular o grupo." });
    } finally {
      setSavingLinks(false);
    }
  };

  if (!open) return null;
  const query = directorySearch.trim().toLowerCase();
  const visibleGroups = groups.filter((group) => `${group.name} ${group.id}`.toLowerCase().includes(query));
  const visibleContacts = contacts.filter((contact) => `${contact.name} ${contact.phone} ${contact.id}`.toLowerCase().includes(query));

  return createPortal(
    <div className="fixed inset-0 z-[10100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Conectar WhatsApp">
      <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground"><QrCode className="h-5 w-5 text-primary" /> Conectar número do WhatsApp</h2>
            <p className="mt-1 text-sm text-muted-foreground">Leia o QR Code pelo WhatsApp no celular para carregar grupos e contatos.</p>
            <p className="mt-2 text-xs text-primary">O cadastro é compartilhado e permanece salvo mesmo se este número for desconectado. Um novo número poderá usar os grupos dos quais participar.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-5 space-y-5">
          <div className={`rounded-lg border px-4 py-3 text-sm ${connection.connected ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${connection.connected ? "bg-green-500" : "bg-amber-500"}`} />{connection.connected ? "Número conectado" : `Estado: ${connection.state || "desconectado"}`}</span>
              <Button type="button" size="sm" onClick={connectNumber} disabled={connecting} className="gap-1.5">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                {connection.connected ? "Verificar conexão" : "Gerar QR Code"}
              </Button>
            </div>
          </div>

          {qrCode && !connection.connected && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
              <p className="mb-3 text-sm font-semibold text-foreground">No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
              <img src={qrCode} alt="QR Code para conectar o WhatsApp" className="mx-auto h-64 w-64 rounded-lg border border-border bg-white p-2" />
              <p className="mt-3 text-xs text-muted-foreground">O QR Code expira. Gere outro se não conseguir ler.</p>
            </div>
          )}

          {notice && <div className={`rounded-lg px-4 py-3 text-sm ${notice.type === "error" ? "bg-red-50 text-red-700" : notice.type === "success" ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"}`}>{notice.text}</div>}

          <div className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-semibold text-muted-foreground">Cliente para vincular grupo e contatos
              <select value={targetClientId} onChange={(event) => {
                const id = event.target.value;
                const client = clients.find((item) => item.id === id);
                const groupIds = Array.isArray(client?.whatsapp_group_ids)
                  ? client.whatsapp_group_ids
                  : [client?.whatsapp_group_id].filter(Boolean);
                setTargetClientId(id);
                setSelectedGroupIds(new Set(groupIds));
                setSelectedContactIds(new Set(client?.whatsapp_contact_ids || []));
              }} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground">
                <option value="">Selecione um cliente...</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <Input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} placeholder="Buscar grupo ou contato..." className="h-10 sm:max-w-xs" />
            <Button type="button" variant="outline" onClick={() => loadDirectory(true)} disabled={directoryLoading} className="h-10 gap-1.5 whitespace-nowrap">
              <RefreshCw className={`h-4 w-4 ${directoryLoading ? "animate-spin" : ""}`} /> Atualizar listas
            </Button>
          </div>

          {directoryError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{directoryError}</div>}
          <div className="grid gap-5 md:grid-cols-2">
            <DirectoryList title="Grupos WhatsApp" icon={<Users className="h-4 w-4" />} empty="Nenhum grupo carregado." items={visibleGroups}>
              {(group) => <button type="button" key={group.id} onClick={() => setSelectedGroupIds((previous) => { const next = new Set(previous); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; })} className={`flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left last:border-0 ${selectedGroupIds.has(group.id) ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${selectedGroupIds.has(group.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selectedGroupIds.has(group.id) && <Check className="h-3 w-3" />}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{group.name}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{group.id}</p></div>
                <span onClick={(event) => { event.stopPropagation(); copyId(group.id); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar ID"><Copy className="h-3.5 w-3.5" /></span>
              </button>}
            </DirectoryList>
            <DirectoryList title="Contatos WhatsApp" icon={<ContactRound className="h-4 w-4" />} empty="Nenhum contato carregado." items={visibleContacts}>
              {(contact) => <button type="button" key={contact.id} onClick={() => setSelectedContactIds((previous) => { const next = new Set(previous); next.has(contact.id) ? next.delete(contact.id) : next.add(contact.id); return next; })} className={`flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left last:border-0 ${selectedContactIds.has(contact.id) ? "bg-primary/5" : "hover:bg-muted/50"}`}>
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${selectedContactIds.has(contact.id) ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{selectedContactIds.has(contact.id) && <Check className="h-3 w-3" />}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{contact.name}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{contact.id}</p></div>
                <span onClick={(event) => { event.stopPropagation(); copyId(contact.id); }} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar ID"><Copy className="h-3.5 w-3.5" /></span>
              </button>}
            </DirectoryList>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs text-muted-foreground">{selectedGroupIds.size} grupo(s) e {selectedContactIds.size} contato(s) selecionado(s).</p>
            <Button type="button" onClick={saveLinks} disabled={savingLinks || !targetClientId} className="gap-1.5"><Link2 className="h-4 w-4" />{savingLinks ? "Salvando..." : "Salvar vínculos"}</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DirectoryList({ title, icon, empty, items, children }) {
  return <section className="overflow-hidden rounded-xl border border-border"><div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2.5"><h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">{icon}{title}</h3><span className="text-xs text-muted-foreground">{items.length}</span></div><div className="max-h-64 overflow-y-auto">{items.length ? items.map(children) : <p className="px-3 py-6 text-center text-sm text-muted-foreground">{empty}</p>}</div></section>;
}

// ---- Main page ----
export default function Conversations() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("single"); // "single" | "bulk" | "reports"
  const [connection, setConnection] = useState({ loading: true, connected: false, state: "unknown", error: null });
  const [connectionManagerOpen, setConnectionManagerOpen] = useState(false);

  const loadConnection = async () => {
    setConnection(prev => ({ ...prev, loading: true, error: null }));
    try {
      const result = await invokeMaestroFunction("whatsappStatus", {});
      setConnection({
        loading: false,
        connected: Boolean(result.data?.connected),
        state: result.data?.state || "unknown",
        error: result.data?.error || null,
      });
    } catch (error) {
      setConnection({ loading: false, connected: false, state: "error", error: error.message });
    }
  };

  useEffect(() => {
    maestro.entities.Client.filter({ status: "active" }, "name", 200).then(data => {
      setClients(data);
      setLoading(false);
    });
    loadConnection();
  }, []);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conversas</h1>
          <p className="text-sm text-muted-foreground mt-1">Envie mensagens WhatsApp para grupos de clientes via Evolution API</p>
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
          <button onClick={() => setMode("reports")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mode === "reports" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <CalendarClock className="w-3.5 h-3.5" /> Relatórios e automações
          </button>
        </div>
      </div>

      <div className={`mb-5 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${connection.connected ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${connection.connected ? "bg-green-500" : "bg-amber-500"}`} />
          <span>
            {connection.loading ? "Verificando conexão com a Evolution API..." : connection.connected ? "WhatsApp conectado" : connection.error || "WhatsApp desconectado"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={loadConnection} disabled={connection.loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${connection.loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setConnectionManagerOpen(true)} className="gap-1.5">
            <QrCode className="h-3.5 w-3.5" /> {connection.connected ? "Gerenciar número" : "Conectar número"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Carregando clientes...</p>
        </div>
      ) : mode === "single" ? (
        <SingleSend clients={clients} />
      ) : mode === "bulk" ? (
        <BulkSend clients={clients} />
      ) : (
        <WhatsappReportsPanel clients={clients} />
      )}
      <WhatsAppConnectionManager
        open={connectionManagerOpen}
        onClose={() => setConnectionManagerOpen(false)}
        connection={connection}
        onConnectionChanged={setConnection}
        clients={clients}
        onClientsChanged={setClients}
      />
    </div>
  );
}
