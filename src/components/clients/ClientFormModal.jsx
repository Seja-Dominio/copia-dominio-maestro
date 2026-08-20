import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, MessageSquare, RefreshCw, Check, Crown } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { useConfirmDelete } from "@/components/ConfirmDeleteContext";
import { safeDelete } from "@/lib/safeDelete";
import { SERVICE_OPTIONS, TIER_TAGS } from "@/lib/clientServices";

export default function ClientFormModal({ client, onClose, onSave }) {
  const [formData, setFormData] = useState(client || {
    name: "",
    company_name: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
    responsible: "",
    birthday: "",
    contacts: [],
    avatar_url: "",
    notes: "",
    status: "active",
    services: [],
    tier: "",
    contracted_cards: 0,
    contracted_reels: 0,
    contracted_promocoes: 0,
    contracted_vt: 0,
    contracted_foto: 0,
    contracted_stories: 0,
  });

  const [loading, setLoading] = useState(false);
  const confirmDelete = useConfirmDelete();
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupDropdown, setGroupDropdown] = useState(false);
  const [customServices, setCustomServices] = useState([]);
  const [customServicesConfigId, setCustomServicesConfigId] = useState(null);

  useEffect(() => {
    base44.entities.AppConfig.filter({ key: "custom_services" }).then(configs => {
      if (configs.length > 0) {
        setCustomServices(configs[0].value?.services || []);
        setCustomServicesConfigId(configs[0].id);
      }
    });
  }, []);

  const saveCustomServiceGlobally = async (serviceName) => {
    const updated = [...customServices, serviceName];
    setCustomServices(updated);
    if (customServicesConfigId) {
      await base44.entities.AppConfig.update(customServicesConfigId, { value: { services: updated } });
    } else {
      const created = await base44.entities.AppConfig.create({ key: "custom_services", value: { services: updated } });
      setCustomServicesConfigId(created.id);
    }
  };

  const toggleService = (value) => {
    setFormData(prev => {
      const services = prev.services || [];
      return {
        ...prev,
        services: services.includes(value)
          ? services.filter(s => s !== value)
          : [...services, value]
      };
    });
  };

  const setTier = (value) => {
    setFormData(prev => ({ ...prev, tier: prev.tier === value ? "" : value }));
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    setGroupDropdown(true);
    try {
      const res = await base44.functions.invoke("listWhatsappGroups", {});
      setGroups(res.data?.groups || []);
    } catch {
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addContact = () => {
    setFormData(prev => ({ ...prev, contacts: [...(prev.contacts || []), { name: "", birthday: "" }] }));
  };

  const updateContact = (i, field, value) => {
    setFormData(prev => {
      const contacts = [...(prev.contacts || [])];
      contacts[i] = { ...contacts[i], [field]: value };
      return { ...prev, contacts };
    });
  };

  const removeContact = (i) => {
    setFormData(prev => ({ ...prev, contacts: (prev.contacts || []).filter((_, idx) => idx !== i) }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      let result;
      const { _newService, ...dataToSave } = formData;
      if (client?.id) {
        await base44.entities.Client.update(client.id, dataToSave);
        result = { ...client, ...dataToSave };
      } else {
        result = await base44.entities.Client.create(dataToSave);
      }
      onSave(result);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmDelete({ title: "Excluir cliente?", message: `"${client.name}" e todos os dados associados serão removidos permanentemente.` });
    if (!confirmed) return;
    setLoading(true);
    try {
      await safeDelete("client", "Client", client);
      onSave(null, true);
    } finally {
      setLoading(false);
    }
  };

  const currentTierTag = TIER_TAGS.find(t => t.value === (formData.tier || ""));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{client?.id ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

          {/* Tarja do cliente */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Tarja do Cliente</label>
            <div className="flex flex-wrap gap-2">
              {TIER_TAGS.filter(t => t.value !== "").map(tag => {
                const selected = (formData.tier || "") === tag.value;
                return (
                  <button
                    key={tag.value}
                    type="button"
                    onClick={() => setTier(tag.value)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                    style={selected
                      ? { backgroundColor: tag.color, color: "#fff", borderColor: tag.color }
                      : { backgroundColor: "transparent", color: tag.text, borderColor: tag.border }
                    }
                  >
                    {selected && <Check className="w-3 h-3" />}
                    {tag.value === "elite" && <Crown className="w-3 h-3" fill={selected ? "#fff" : "none"} />}
                    {tag.label}
                  </button>
                );
              })}
              {formData.tier && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, tier: "" }))}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-all"
                >
                  ✕ Remover tarja
                </button>
              )}
            </div>
            {currentTierTag?.value && (
              <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl border" style={{ borderColor: currentTierTag.border, backgroundColor: currentTierTag.bg }}>
                {currentTierTag.value === "elite" && <Crown className="w-3.5 h-3.5" style={{ color: currentTierTag.color }} fill={currentTierTag.color} />}
                <span className="text-xs font-bold" style={{ color: currentTierTag.text }}>Tarja ativa: {currentTierTag.label}</span>
              </div>
            )}
          </div>

          {/* Serviços Prestados */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Serviços Prestados</label>
            <div className="flex flex-wrap gap-2">
              {SERVICE_OPTIONS.map(opt => {
                const selected = (formData.services || []).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleService(opt.value)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                    style={selected
                      ? { backgroundColor: opt.color, color: "#fff", borderColor: opt.color }
                      : { backgroundColor: "transparent", color: opt.text, borderColor: opt.color, opacity: 0.7 }
                    }
                  >
                    {selected && <Check className="w-3 h-3" />}
                    {opt.label}
                  </button>
                );
              })}
              {/* Serviços customizados globais */}
              {customServices
                .filter(s => !SERVICE_OPTIONS.find(o => o.value === s))
                .map(s => {
                  const selected = (formData.services || []).includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleService(s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
                      style={selected
                        ? { backgroundColor: "hsl(var(--primary))", color: "#fff", borderColor: "hsl(var(--primary))" }
                        : { backgroundColor: "transparent", color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))", opacity: 0.7 }
                      }
                    >
                      {selected && <Check className="w-3 h-3" />}
                      {s}
                    </button>
                  );
                })}
            </div>
            {/* Adicionar serviço customizado */}
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Adicionar novo serviço..."
                value={formData._newService || ""}
                onChange={e => setFormData(prev => ({ ...prev, _newService: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === "Enter" && formData._newService?.trim()) {
                    e.preventDefault();
                    const val = formData._newService.trim();
                    if (!(formData.services || []).includes(val)) {
                      setFormData(prev => ({ ...prev, services: [...(prev.services || []), val], _newService: "" }));
                    }
                    if (!customServices.includes(val) && !SERVICE_OPTIONS.find(o => o.value === val || o.label === val)) {
                      saveCustomServiceGlobally(val);
                    }
                  }
                }}
                className="h-8 text-xs flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 px-2.5"
                disabled={!formData._newService?.trim()}
                onClick={() => {
                  const val = formData._newService?.trim();
                  if (val && !(formData.services || []).includes(val)) {
                    setFormData(prev => ({ ...prev, services: [...(prev.services || []), val], _newService: "" }));
                  }
                  if (val && !customServices.includes(val) && !SERVICE_OPTIONS.find(o => o.value === val || o.label === val)) {
                    saveCustomServiceGlobally(val);
                  }
                }}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Nome</label>
            <Input name="name" value={formData.name} onChange={handleChange} placeholder="Nome do cliente" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Razão Social</label>
            <Input name="company_name" value={formData.company_name} onChange={handleChange} placeholder="Razão social" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">CNPJ</label>
            <Input name="cnpj" value={formData.cnpj} onChange={handleChange} placeholder="CNPJ" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-foreground">Email</label>
              <Input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="email@example.com" />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground">Telefone</label>
              <Input name="phone" value={formData.phone} onChange={handleChange} placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Endereço</label>
            <Input name="address" value={formData.address} onChange={handleChange} placeholder="Endereço completo" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Responsável</label>
            <Input name="responsible" value={formData.responsible} onChange={handleChange} placeholder="Nome do responsável" />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Aniversário do Cliente</label>
            <Input name="birthday" type="date" value={formData.birthday || ""} onChange={handleChange} />
          </div>

          {/* Contatos com aniversário */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-foreground">Contatos com Aniversário</label>
              <Button type="button" size="sm" variant="outline" onClick={addContact} className="gap-1 h-7 text-xs">
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </div>
            {(formData.contacts || []).length === 0 && (
              <p className="text-xs text-muted-foreground italic">Nenhum contato cadastrado</p>
            )}
            <div className="space-y-2">
              {(formData.contacts || []).map((contact, i) => (
                <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg p-2">
                  <Input
                    placeholder="Nome do contato"
                    value={contact.name}
                    onChange={e => updateContact(i, "name", e.target.value)}
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    type="date"
                    value={contact.birthday || ""}
                    onChange={e => updateContact(i, "birthday", e.target.value)}
                    className="h-7 text-xs w-36"
                  />
                  <button onClick={() => removeContact(i)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Grupo WhatsApp */}
          <div>
            <label className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-green-600" /> Grupo WhatsApp
            </label>
            <div className="flex gap-2">
              <Input
                name="whatsapp_group_id"
                value={formData.whatsapp_group_id || ""}
                onChange={handleChange}
                placeholder="Ex: 120363xxxxxx@g.us"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={loadGroups} disabled={loadingGroups} className="gap-1 whitespace-nowrap h-9">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingGroups ? "animate-spin" : ""}`} />
                Buscar Grupos
              </Button>
            </div>
            {groupDropdown && (
              <div className="mt-1 border border-border rounded-lg bg-card shadow-lg max-h-48 overflow-y-auto">
                {loadingGroups ? (
                  <p className="text-xs text-muted-foreground p-3">Buscando grupos...</p>
                ) : groups.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">Nenhum grupo encontrado.</p>
                ) : (
                  <>
                    <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">{groups.length} grupos</span>
                      <button onClick={() => setGroupDropdown(false)} className="text-xs text-muted-foreground hover:text-foreground">Fechar</button>
                    </div>
                    {groups.map(g => (
                      <button key={g.id} onClick={() => { setFormData(prev => ({ ...prev, whatsapp_group_id: g.id })); setGroupDropdown(false); }}
                        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted transition-colors">
                        <span className="text-sm">💬</span>
                        <div>
                          <p className="text-xs font-medium text-foreground">{g.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{g.id}</p>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Postagens contratadas por formato */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-2 block">Postagens contratadas por formato</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "contracted_cards", label: "Cards", color: "#4ade80" },
                { key: "contracted_reels", label: "Reels", color: "#60a5fa" },
                { key: "contracted_promocoes", label: "Promoções", color: "#f87171" },
                { key: "contracted_foto", label: "Foto", color: "#fbbf24" },
                { key: "contracted_vt", label: "VT", color: "#fb923c" },
                { key: "contracted_stories", label: "Stories", color: "#a78bfa" },
              ].map(f => (
                <div key={f.key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                  <span className="text-xs font-medium text-muted-foreground">{f.label}</span>
                  <Input
                    type="number"
                    min={0}
                    value={formData[f.key] || 0}
                    onChange={e => setFormData(prev => ({ ...prev, [f.key]: Number(e.target.value) || 0 }))}
                    className="h-7 w-14 text-xs text-center px-1"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">URL Avatar</label>
            <Input name="avatar_url" value={formData.avatar_url} onChange={handleChange} placeholder="https://..." />
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Status</label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground">Notas</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Observações sobre o cliente"
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div>
            {client?.id && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading} className="gap-2">
                <Trash2 className="w-4 h-4" /> Excluir
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}