import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Search, RefreshCw, Instagram as InstagramIcon, Settings2 } from "lucide-react";
import InsightsTab from "@/components/clients/InsightsTab";
import InstagramSetupForm from "@/components/instagram/InstagramSetupForm";
import { Button } from "@/components/ui/button";

const SUB_TABS = [
  { id: "organico", label: "Orgânico" },
  { id: "trafego", label: "Tráfego" },
];

export default function Instagram() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [subTab, setSubTab] = useState("organico");

  useEffect(() => {
    base44.entities.Client.filter({ status: "active" }, "name", 200).then(c => {
      setClients(c);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() =>
    clients.filter(c => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.instagram_username || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }),
    [clients, search]
  );

  const selectedClient = clients.find(c => c.id === selectedClientId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center">
            <span className="text-white text-sm font-bold">IG</span>
          </div>
          Instagram
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Métricas e análises das contas dos clientes</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-border mb-5">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              subTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "organico" && (
        <OrganicSection
          clients={filtered}
          allClients={clients}
          setClients={setClients}
          search={search}
          setSearch={setSearch}
          selectedClient={selectedClient}
          selectedClientId={selectedClientId}
          setSelectedClientId={setSelectedClientId}
        />
      )}

      {subTab === "trafego" && (
        <TrafficSection clients={filtered} search={search} setSearch={setSearch} />
      )}
    </div>
  );
}

function OrganicSection({ clients, allClients, setClients, search, setSearch, selectedClient, selectedClientId, setSelectedClientId }) {
  const [editingInstagram, setEditingInstagram] = useState(false);

  function handleSetupSaved() {
    // Refresh clients list
    base44.entities.Client.filter({ status: "active" }, "name", 200).then(c => {
      setClients(c);
      setEditingInstagram(false);
    });
  }

  return (
    <div className="flex gap-5 flex-col lg:flex-row">
      {/* Client list */}
      <div className="w-full lg:w-72 flex-shrink-0">
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Buscar por nome ou @..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto">
          {clients.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedClientId(c.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                selectedClientId === c.id
                  ? "bg-primary/10 border border-primary/30"
                  : "hover:bg-muted border border-transparent"
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {c.instagram_username ? `@${c.instagram_username.replace("@", "")}` : "Sem @"}
                </p>
              </div>
              {c.instagram_account_id && (
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Conectado" />
              )}
            </button>
          ))}
          {clients.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhum cliente encontrado</p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {selectedClient ? (
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                {selectedClient.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1">
                <h2 className="text-sm font-bold text-foreground">{selectedClient.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedClient.instagram_username ? `@${selectedClient.instagram_username.replace("@", "")}` : "Instagram não configurado"}
                </p>
              </div>
              {selectedClient.instagram_username && !editingInstagram && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditingInstagram(true)}
                  title="Editar Instagram"
                >
                  <Settings2 className="w-4 h-4" />
                </Button>
              )}
            </div>

            {editingInstagram || !selectedClient.instagram_account_id ? (
              <div>
                <InstagramSetupForm client={selectedClient} onSaved={handleSetupSaved} />
                {editingInstagram && selectedClient.instagram_account_id && (
                  <button
                    onClick={() => setEditingInstagram(false)}
                    className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
            ) : (
              <InsightsTab client={selectedClient} />
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/10 via-purple-500/10 to-orange-400/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <p className="text-sm font-semibold text-foreground mb-1">Selecione um cliente</p>
            <p className="text-xs text-muted-foreground">Escolha um cliente na lista para visualizar as métricas orgânicas do Instagram</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TrafficSection({ clients, search, setSearch }) {
  return (
    <div>
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Buscar cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-card border border-border rounded-2xl p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-400/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🎯</span>
        </div>
        <p className="text-sm font-semibold text-foreground mb-1">Tráfego Pago</p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Módulo de métricas de tráfego pago em desenvolvimento. Em breve você poderá acompanhar campanhas, CPC, CPM e ROI dos clientes.
        </p>
      </div>
    </div>
  );
}