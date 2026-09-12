import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CollaboratorHoursModal({ collaborator, timesheets, onClose, onUpdate }) {
  const [RC, setRC] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingHours, setAddingHours] = useState(false);
  const [newHours, setNewHours] = useState("");
  const [selectedClient, setSelectedClient] = useState("");

  useEffect(() => {
    import("recharts").then(setRC);
  }, []);

  var clientMap = {};
  timesheets.forEach(function(t) {
    if (t.collaborator_id === collaborator.id && t.client_id) {
      if (!clientMap[t.client_id]) {
        clientMap[t.client_id] = { name: t.client_name, minutes: 0, id: t.client_id };
      }
      clientMap[t.client_id].minutes += t.duration_minutes || 0;
    }
  });

  var clientData = Object.values(clientMap)
    .map(function(c) { return Object.assign({}, c, { hours: (c.minutes / 60).toFixed(1) }); })
    .sort(function(a, b) { return b.minutes - a.minutes; });

  var chartData = clientData.map(function(c) {
    return {
      name: c.name.length > 20 ? c.name.substring(0, 17) + "..." : c.name,
      Horas: parseFloat(c.hours),
    };
  });

  var totalHours = clientData.reduce(function(sum, c) { return sum + parseFloat(c.hours); }, 0).toFixed(1);

  async function addManualHours() {
    if (!newHours || !selectedClient || isNaN(newHours) || parseFloat(newHours) <= 0) return;
    setAddingHours(true);
    var client = clientData.find(function(c) { return c.id === selectedClient; });
    var durationMinutes = Math.round(parseFloat(newHours) * 60);
    await base44.entities.Timesheet.create({
      collaborator_id: collaborator.id,
      collaborator_name: collaborator.name,
      client_id: selectedClient,
      client_name: client ? client.name : "Cliente",
      job_id: "",
      job_title: "Apontamento manual de horas",
      project_id: "",
      project_name: "",
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      duration_minutes: durationMinutes,
      is_running: false,
      status: "approved",
      notes: "Apontado manualmente: " + newHours + "h",
    });
    setNewHours("");
    setSelectedClient("");
    setShowAddForm(false);
    setAddingHours(false);
    if (onUpdate) onUpdate();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-foreground">{collaborator.name}</h2>
            <p className="text-xs text-muted-foreground">{collaborator.role}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-muted/50 rounded-xl p-4 border border-border">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-1">Total de Horas</p>
                <p className="text-2xl font-black text-foreground">{totalHours}h</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold mb-1">Clientes Atendidos</p>
                <p className="text-2xl font-black text-foreground">{clientData.length}</p>
              </div>
            </div>
          </div>

          {clientData.length > 0 ? (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-3">Tempo por Cliente</h3>
              {RC ? (
                <RC.ResponsiveContainer width="100%" height={300}>
                  <RC.BarChart data={chartData}>
                    <RC.CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <RC.XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <RC.YAxis tick={{ fontSize: 12 }} />
                    <RC.Tooltip
                      formatter={function(value) { return value + "h"; }}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    />
                    <RC.Bar dataKey="Horas" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                  </RC.BarChart>
                </RC.ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum registro de horas para este colaborador
            </div>
          )}

          {clientData.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-3">Detalhamento por Cliente</h3>
              <div className="space-y-2">
                {clientData.map(function(c) {
                  return (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                      <span className="text-sm font-medium text-foreground">{c.name}</span>
                      <span className="text-sm font-bold text-primary">{c.hours}h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <Button onClick={function() { setShowAddForm(!showAddForm); }} variant="outline" className="w-full mb-3" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Apontamento Manual
            </Button>

            {showAddForm && (
              <div className="bg-accent/20 border border-accent rounded-lg p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Cliente</label>
                  <select
                    className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={selectedClient}
                    onChange={function(e) { setSelectedClient(e.target.value); }}
                  >
                    <option value="">Selecionar cliente...</option>
                    {clientData.map(function(c) {
                      return <option key={c.id} value={c.id}>{c.name}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Horas</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="Ex: 2.5"
                    className="w-full h-8 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={newHours}
                    onChange={function(e) { setNewHours(e.target.value); }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={function() { setShowAddForm(false); setNewHours(""); setSelectedClient(""); }} variant="outline" size="sm" className="flex-1">
                    Cancelar
                  </Button>
                  <Button onClick={addManualHours} disabled={addingHours || !newHours || !selectedClient} size="sm" className="flex-1">
                    {addingHours ? "Adicionando..." : "Adicionar"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}