import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Search, Users, Briefcase, Building2,
  Phone, Mail, Calendar, Edit2, Globe, Tag, Lock, Trash2, Shield
} from "lucide-react";
import { format } from "date-fns";
import CollaboratorFormModal from "../components/collaborators/CollaboratorFormModal";
import AccessCredentialsModal from "../components/collaborators/AccessCredentialsModal";
import ClientFormModal from "../components/clients/ClientFormModal";
import SupplierFormModal from "../components/suppliers/SupplierFormModal";
import SquadsManager from "../components/squads/SquadsManager";

const TABS = [
  { id: "clients", label: "Clientes", icon: Building2 },
  { id: "collaborators", label: "Colaboradores", icon: Users },
  { id: "suppliers", label: "Fornecedores", icon: Briefcase },
  { id: "squads", label: "Squads", icon: Shield },
];

export default function Records() {
  const [tab, setTab] = useState("clients");
  const [clients, setClients] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const sessionCollaborator = (() => { try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; } })();
  const isAdmin = sessionCollaborator?.access_level === "admin" || sessionCollaborator?.access_level === "master";
  const [editingCollab, setEditingCollab] = useState(null);
  const [showCollabForm, setShowCollabForm] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [selectedCollabForAccess, setSelectedCollabForAccess] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);

  useEffect(() => {
    loadAll();
    
    // Subscribe to real-time updates
    const unsubClient = base44.entities.Client.subscribe((event) => {
      if (event.type === 'create') {
        setClients(prev => prev.some(c => c.id === event.id) ? prev : [event.data, ...prev]);
      } else if (event.type === 'update') {
        setClients(prev => prev.map(c => c.id === event.id ? event.data : c));
      } else if (event.type === 'delete') {
        setClients(prev => prev.filter(c => c.id !== event.id));
      }
    });

    const unsubSupplier = base44.entities.Supplier.subscribe((event) => {
      if (event.type === 'create') {
        setSuppliers(prev => prev.some(s => s.id === event.id) ? prev : [event.data, ...prev]);
      } else if (event.type === 'update') {
        setSuppliers(prev => prev.map(s => s.id === event.id ? event.data : s));
      } else if (event.type === 'delete') {
        setSuppliers(prev => prev.filter(s => s.id !== event.id));
      }
    });

    const unsubCollab = base44.entities.Collaborator.subscribe((event) => {
      if (event.type === 'create') {
        setCollaborators(prev => prev.some(c => c.id === event.id) ? prev : [event.data, ...prev]);
      } else if (event.type === 'update') {
        setCollaborators(prev => prev.map(c => c.id === event.id ? event.data : c));
      } else if (event.type === 'delete') {
        setCollaborators(prev => prev.filter(c => c.id !== event.id));
      }
    });

    return () => {
      unsubClient();
      unsubSupplier();
      unsubCollab();
    };
  }, []);

  async function loadAll() {
    setLoading(true);
    const [c, col, sup] = await Promise.all([
      base44.entities.Client.list("-created_date", 100),
      base44.entities.Collaborator.list("-created_date", 100),
      base44.entities.Supplier.list("-created_date", 100),
    ]);
    setClients(c);
    setCollaborators(col);
    setSuppliers(sup);
    setLoading(false);
  }

  async function deleteCollab(id) {
    await base44.entities.Collaborator.delete(id);
    setCollaborators(prev => prev.filter(c => c.id !== id));
  }

  function getFiltered(data) {
    return data.filter(item =>
      !search || item.name?.toLowerCase().includes(search.toLowerCase()) || item.email?.toLowerCase().includes(search.toLowerCase())
    );
  }

  const currentData = tab === "clients" ? getFiltered(clients) : getFiltered(collaborators);

  return (
    <div className="p-6">
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${tab === "squads" ? "mb-2" : "mb-6"}`}>
         {tab !== "squads" && (
           <div>
             <h1 className="text-2xl font-bold text-foreground">Cadastros</h1>
             <p className="text-sm text-muted-foreground mt-1">Base de dados de contatos e parceiros</p>
           </div>
         )}
         {tab === "squads" && <div />}
         {tab === "collaborators" && (
           <Button className="gap-2 self-start sm:self-auto" onClick={() => { setEditingCollab(null); setShowCollabForm(true); }}>
             <Plus className="w-4 h-4" /> Novo Colaborador
           </Button>
         )}
         {tab === "clients" && (
           <Button className="gap-2 self-start sm:self-auto" onClick={() => { setEditingClient(null); setShowClientForm(true); }}>
             <Plus className="w-4 h-4" /> Novo Cliente
           </Button>
         )}
         {tab === "suppliers" && (
            <Button className="gap-2 self-start sm:self-auto" onClick={() => { setEditingSupplier(null); setShowSupplierForm(true); }}>
              <Plus className="w-4 h-4" /> Novo Fornecedor
            </Button>
          )}
         </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "squads" && <SquadsManager />}

      {/* Search */}
      {tab !== "squads" && (
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {tab === "squads" ? null : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card p-4 h-24 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {tab === "clients" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFiltered(clients).map(c => (
                <div key={c.id} className="glass-card p-5 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                          {c.name?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.company_name || c.cnpj || "—"}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingClient(c); setShowClientForm(true); }} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" title="Editar">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if(window.confirm("Excluir este cliente?")) base44.entities.Client.delete(c.id); }} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-600" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start justify-between">
                    <div className="flex-1"></div>
                    <Badge className={`${c.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"} border-0 text-xs`}>
                      {c.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {c.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" /> <span>{c.email}</span>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" /> <span>{c.phone}</span>
                      </div>
                    )}
                    {c.birthday && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        <span>{format(new Date(c.birthday), "dd/MM")}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {getFiltered(clients).length === 0 && (
                <div className="col-span-3 text-center py-16">
                  <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">Nenhum cliente cadastrado</p>
                </div>
              )}
            </div>
          )}

          {tab === "collaborators" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFiltered(collaborators).map(c => (
                <div key={c.id} className="glass-card p-5 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {c.avatar_url ? (
                        <img src={c.avatar_url} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
                          {c.name?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.role || "—"}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingCollab(c); setShowCollabForm(true); }} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" title="Editar dados">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { setSelectedCollabForAccess(c); setShowAccessModal(true); }} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" title="Gerenciar credenciais de acesso">
                           <Lock className="w-3.5 h-3.5" />
                         </button>
                        {isAdmin && (
                          <button onClick={() => { if(window.confirm(`Excluir colaborador "${c.name}"?`)) deleteCollab(c.id); }} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-500" title="Excluir colaborador">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        </div>
                  </div>
                  <div className="space-y-1.5">
                    {c.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" /> {c.email}
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" /> {c.phone}
                      </div>
                    )}
                    {c.birthday && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" /> Aniv: {format(new Date(c.birthday + "T12:00:00"), "dd/MM")}
                      </div>
                    )}

                    {c.contract_end_date && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        Contrato até: <span className="font-semibold">{format(new Date(c.contract_end_date + "T12:00:00"), "dd/MM/yyyy")}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <Badge className={`${c.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"} border-0 text-xs`}>
                      {c.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
              ))}
              {getFiltered(collaborators).length === 0 && (
                <div className="col-span-3 text-center py-16">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">Nenhum colaborador cadastrado</p>
                  <Button className="mt-4 gap-2" onClick={() => { setEditingCollab(null); setShowCollabForm(true); }}>
                    <Plus className="w-4 h-4" /> Adicionar colaborador
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === "suppliers" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {getFiltered(suppliers).map(s => (
                <div key={s.id} className="glass-card p-5 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold text-lg">
                        {s.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.company_name || "—"}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingSupplier(s); setShowSupplierForm(true); }} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground" title="Editar">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if(window.confirm("Excluir este fornecedor?")) base44.entities.Supplier.delete(s.id); }} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-600" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-start justify-between">
                    <div className="flex-1"></div>
                    <Badge className={`${s.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"} border-0 text-xs`}>
                      {s.status === "active" ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {s.category && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Tag className="w-3 h-3" /> <span className="capitalize">{s.category}</span>
                      </div>
                    )}
                    {s.contact_name && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="w-3 h-3" /> {s.contact_name}
                      </div>
                    )}
                    {s.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" /> {s.email}
                      </div>
                    )}
                    {s.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" /> {s.phone}
                      </div>
                    )}
                    {s.website && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Globe className="w-3 h-3" /> {s.website}
                      </div>
                    )}
                    {s.payment_terms && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Briefcase className="w-3 h-3" /> {s.payment_terms}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {getFiltered(suppliers).length === 0 && (
                <div className="col-span-3 text-center py-16">
                  <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-muted-foreground">Nenhum fornecedor cadastrado</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showCollabForm && (
        <CollaboratorFormModal
          collaborator={editingCollab}
          onClose={() => { setShowCollabForm(false); setEditingCollab(null); }}
          onSave={result => {
            if (editingCollab) {
              setCollaborators(prev => prev.map(c => c.id === result.id ? result : c));
            } else {
              setCollaborators(prev => [result, ...prev]);
            }
            setShowCollabForm(false);
            setEditingCollab(null);
          }}
        />
      )}

      {showAccessModal && (
        <AccessCredentialsModal
          collaborator={selectedCollabForAccess}
          isOpen={showAccessModal}
          onClose={() => { setShowAccessModal(false); setSelectedCollabForAccess(null); }}
          onSaved={() => {
            loadAll();
            setShowAccessModal(false);
            setSelectedCollabForAccess(null);
          }}
        />
      )}

      {showClientForm && (
        <ClientFormModal
          client={editingClient}
          onClose={() => { setShowClientForm(false); setEditingClient(null); }}
          onSave={(result, deleted) => {
            if (deleted) {
              setClients(prev => prev.filter(c => c.id !== editingClient.id));
            } else if (editingClient) {
              setClients(prev => prev.map(c => c.id === result.id ? result : c));
            } else {
              setClients(prev => [result, ...prev]);
            }
            setShowClientForm(false);
            setEditingClient(null);
          }}
        />
      )}

      {showSupplierForm && (
        <SupplierFormModal
          supplier={editingSupplier}
          onClose={() => { setShowSupplierForm(false); setEditingSupplier(null); }}
          onSave={(result, deleted) => {
            if (deleted) {
              setSuppliers(prev => prev.filter(s => s.id !== editingSupplier.id));
            } else if (editingSupplier) {
              setSuppliers(prev => prev.map(s => s.id === result.id ? result : s));
            } else {
              setSuppliers(prev => [result, ...prev]);
            }
            setShowSupplierForm(false);
            setEditingSupplier(null);
          }}
        />
      )}
    </div>
  );
}
