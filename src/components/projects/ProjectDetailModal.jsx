import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Save, Plus } from "lucide-react";
import StandardDrawer from "@/components/ui/StandardDrawer";

const PROJECT_STATUSES = [
  { value: "no_status", label: "Sem status" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluído" },
  { value: "archived", label: "Arquivado" },
];

export default function ProjectDetailModal({ project: initialProject, onClose, onUpdate }) {
  const [project, setProject] = useState(initialProject);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [teamInput, setTeamInput] = useState("");
  const [allTeams, setAllTeams] = useState([]);
  const [showTeamSugg, setShowTeamSugg] = useState(false);

  // Current teams list
  const teams = project.teams?.length ? project.teams : (project.team ? [project.team] : []);

  useEffect(() => {
    base44.entities.Squad.filter({ is_active: true }, "name", 100).then(squads => {
      setAllTeams(squads.map(s => s.name).sort());
    });
  }, []);

  function addTeam(name) {
    const trimmed = name.trim();
    if (!trimmed || teams.includes(trimmed)) return;
    const next = [...teams, trimmed];
    setProject(p => ({ ...p, teams: next, team: next[0] }));
    setDirty(true);
    setTeamInput("");
    setShowTeamSugg(false);
  }

  function removeTeam(name) {
    const next = teams.filter(t => t !== name);
    setProject(p => ({ ...p, teams: next, team: next[0] || "" }));
    setDirty(true);
  }

  function update(key, value) {
    setProject(p => ({ ...p, [key]: value }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const updated = await base44.entities.Project.update(project.id, project);
    onUpdate(updated);
    setDirty(false);
    setSaving(false);
  }

  const filteredSugg = allTeams.filter(
    t => !teams.includes(t) && t.toLowerCase().includes(teamInput.toLowerCase())
  );

  const drawerTitle = (
    <div className="flex-1 min-w-0">
      <span className="text-xs font-mono text-muted-foreground">#{project.number || "—"}</span>
      <span className="ml-2 text-sm font-bold text-foreground">{project.name}</span>
      <span className="ml-2 text-xs text-muted-foreground">{project.client_name || ""}</span>
    </div>
  );

  const drawerFooter = dirty ? (
    <div className="flex gap-3">
      <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
      <Button onClick={save} disabled={saving} className="flex-1 gap-1.5">
        <Save className="w-3.5 h-3.5" />
        {saving ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  ) : null;

  return (
    <StandardDrawer open={true} onClose={onClose} title={drawerTitle} width={520} footer={drawerFooter}>
        <div className="p-6 space-y-5">
          {/* Editable name */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do Projeto</label>
            <input
              className="block text-lg font-bold text-foreground bg-transparent border-b border-border outline-none w-full"
              value={project.name}
              onChange={e => update("name", e.target.value)}
            />
          </div>
          {/* Status */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_STATUSES.map(s => (
                <button
                  key={s.value}
                  onClick={() => update("status", s.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    project.status === s.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Equipes — multi-tag */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Equipe(s)</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {teams.map(t => (
                <span key={t} className="flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                  {t}
                  <button type="button" onClick={() => removeTeam(t)} className="hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <div className="flex gap-1.5">
                <Input
                  placeholder="Digite ou selecione uma equipe..."
                  value={teamInput}
                  onChange={e => { setTeamInput(e.target.value); setShowTeamSugg(true); }}
                  onFocus={() => setShowTeamSugg(true)}
                  onBlur={() => setTimeout(() => setShowTeamSugg(false), 150)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTeam(teamInput); } }}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => addTeam(teamInput)}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {showTeamSugg && filteredSugg.length > 0 && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-36 overflow-y-auto">
                  {filteredSugg.map(t => (
                    <button
                      key={t}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      onMouseDown={() => addTeam(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">As equipes definem quais templates aparecem no cronograma</p>
          </div>

          {/* Deadlines */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Prazo Desejado</label>
              <Input type="date" value={project.desired_deadline || ""} onChange={e => update("desired_deadline", e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Prazo Estimado</label>
              <Input type="date" value={project.estimated_deadline || ""} onChange={e => update("estimated_deadline", e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Orçamento (R$)</label>
            <Input
              type="number"
              placeholder="0,00"
              value={project.budget || ""}
              onChange={e => update("budget", Number(e.target.value))}
              className="h-8 text-xs"
            />
          </div>

          {/* Briefing */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Briefing</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={4}
              placeholder="Briefing do projeto..."
              value={project.briefing || ""}
              onChange={e => update("briefing", e.target.value)}
            />
          </div>
        </div>
    </StandardDrawer>
  );
}