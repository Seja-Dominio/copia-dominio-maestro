import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Trash2, ChevronDown } from "lucide-react";

import { useStatusConfig } from "@/lib/AppConfigContext";

export const JOB_STATUSES_DEFAULT = [
  { value: "pending_briefing", label: "Pend. Briefing/Roteiro" },
  { value: "pending_capture",  label: "Pend. Captação" },
  { value: "pending_design",   label: "Pend. Designer" },
  { value: "pending_edit",     label: "Pend. Edição" },
  { value: "internal_approval",label: "Aprov. Interna" },
  { value: "client_approval",  label: "Aprov. Cliente" },
  { value: "scheduled",        label: "Agendado" },
  { value: "completed",        label: "Concluído" },
];

// Legacy export used by Templates page
export const JOB_STATUSES = JOB_STATUSES_DEFAULT;

const emptyTask = (order) => ({
  title: "",
  responsible_id: "",
  responsible_name: "",
  complete_at_status: "",
  days_before_post: "",
  order,
});

export default function CreateJobTemplateModal({ onClose, onCreate, editingTemplate }) {
  const { statusConfig } = useStatusConfig();
  // Build dynamic JOB_STATUSES from current config labels
  const JOB_STATUSES = JOB_STATUSES_DEFAULT.map(s => ({
    ...s,
    label: statusConfig[s.value]?.label ?? s.label,
  }));
  // Suporta teams como array, com fallback para team string legado
  const initialTeams = editingTemplate?.teams?.length
    ? editingTemplate.teams
    : editingTemplate?.team
      ? [editingTemplate.team]
      : [];

  const initialContentTypes = editingTemplate?.content_types?.length
    ? editingTemplate.content_types
    : editingTemplate?.content_type
      ? [editingTemplate.content_type]
      : [];

  const CONTENT_TYPE_OPTIONS = [
    { value: "card",     label: "Card / Foto" },
    { value: "reels",    label: "Reels" },
    { value: "promocao", label: "Promoção" },
    { value: "foto",     label: "Foto" },
    { value: "vt",       label: "VT / Vídeo" },
    { value: "stories",  label: "Stories" },
  ];

  const [form, setForm] = useState({ name: editingTemplate?.name || "", job_title: editingTemplate?.job_title || "" });
  const [contentTypes, setContentTypes] = useState(initialContentTypes);
  const [teams, setTeams] = useState(initialTeams);
  const [teamInput, setTeamInput] = useState("");
  const [allTeams, setAllTeams] = useState([]);
  const [showTeamSuggestions, setShowTeamSuggestions] = useState(false);
  const [tasks, setTasks] = useState(
    editingTemplate?.subtasks?.length
      ? editingTemplate.subtasks.map((s, i) => ({ ...s, order: i }))
      : [emptyTask(0)]
  );
  const [collaborators, setCollaborators] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Collaborator.filter({ is_active: true }, "name", 100),
      base44.entities.Squad.filter({ is_active: true }, "name", 100),
    ]).then(([collabs, squads]) => {
      setCollaborators(collabs);
      setAllTeams(squads.map(s => s.name).sort());
    });
  }, []);

  function addTeam(name) {
    const trimmed = name.trim();
    if (!trimmed || teams.includes(trimmed)) return;
    setTeams(prev => [...prev, trimmed]);
    setTeamInput("");
    setShowTeamSuggestions(false);
  }

  function removeTeam(name) {
    setTeams(prev => prev.filter(t => t !== name));
  }

  const filteredSuggestions = allTeams.filter(
    t => !teams.includes(t) && t.toLowerCase().includes(teamInput.toLowerCase())
  );

  function addTask() {
    setTasks(prev => [...prev, emptyTask(prev.length)]);
  }

  function removeTask(index) {
    setTasks(prev => prev.filter((_, i) => i !== index));
  }

  function updateTask(index, key, value) {
    setTasks(prev => prev.map((s, i) => i === index ? { ...s, [key]: value } : s));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) return;
    setSaving(true);
    const validTasks = tasks.filter(s => s.title.trim()).map((s, i) => ({ ...s, order: i }));
    const payload = {
      name: form.name,
      job_title: form.job_title || "",
      teams: teams,
      team: teams[0] || "",
      content_types: contentTypes,
      content_type: contentTypes[0] || "",
      subtasks: validTasks.map(s => ({
        ...s,
        days_before_post: s.days_before_post !== "" ? s.days_before_post : undefined,
      })),
    };
    let result;
    if (editingTemplate) {
      result = await base44.entities.JobTemplate.update(editingTemplate.id, payload);
    } else {
      result = await base44.entities.JobTemplate.create(payload);
    }
    onCreate(result);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-lg font-bold text-foreground">
            {editingTemplate ? "Editar Template de Job" : "Novo Template de Job"}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Nome */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nome do Template *</label>
            <Input
              placeholder="Ex: Post Reels Padrão"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          {/* Equipe — multi-tag */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Equipe(s)</label>
            {/* Tags selecionadas */}
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
            {/* Input + sugestões */}
            <div className="relative">
              <div className="flex gap-1.5">
                <Input
                  placeholder="Digite uma equipe..."
                  value={teamInput}
                  onChange={e => { setTeamInput(e.target.value); setShowTeamSuggestions(true); }}
                  onFocus={() => setShowTeamSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTeamSuggestions(false), 150)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTeam(teamInput); } }}
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => addTeam(teamInput)}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
              {showTeamSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-36 overflow-y-auto">
                  {filteredSuggestions.map(t => (
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
            <p className="text-[10px] text-muted-foreground mt-1">Templates serão filtrados por equipe ao criar jobs</p>
          </div>

          {/* Tipos de Conteúdo/Formatos */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Formatos de Postagem</label>
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPE_OPTIONS.map(opt => {
                const active = contentTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setContentTypes(prev =>
                      active ? prev.filter(v => v !== opt.value) : [...prev, opt.value]
                    )}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Este template será sugerido para esses formatos ao criar jobs em massa</p>
          </div>

          {/* Título do Job */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Título do Job</label>
            <Input
              placeholder="Ex: Feed Card - [cliente]"
              value={form.job_title}
              onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))}
            />
          </div>

          {/* Tarefas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tarefas</label>
              <Button type="button" size="sm" variant="outline" onClick={addTask} className="gap-1.5 h-7 text-xs">
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </div>
            <div className="space-y-3">
              {tasks.map((s, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-muted/50 rounded-xl border border-border">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0 mt-2">
                    {i + 1}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Título da tarefa *"
                      value={s.title}
                      onChange={e => updateTask(i, "title", e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                        Responsável
                      </label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        style={{ WebkitAppearance: "menulist", appearance: "menulist" }}
                        value={s.responsible_id || ""}
                        onChange={e => {
                          const collab = collaborators.find(c => c.id === e.target.value);
                          setTasks(prev => prev.map((t, idx) => idx === i ? { ...t, responsible_id: e.target.value, responsible_name: collab?.name || "" } : t));
                        }}
                      >
                        <option value="">— Nenhum —</option>
                        {collaborators.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                        Dias antes da Data de Post
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Ex: 3"
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        value={s.days_before_post ?? ""}
                        onChange={e => updateTask(i, "days_before_post", e.target.value !== "" ? Number(e.target.value) : "")}
                      />
                      {s.days_before_post != null && s.days_before_post !== "" ? (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {s.days_before_post === 0 ? "Prazo = mesma data do post" : `Prazo = Data de Post − ${s.days_before_post} dia(s)`}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                        Etapa do job que conclui esta tarefa
                      </label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        style={{ WebkitAppearance: "menulist", appearance: "menulist" }}
                        value={s.complete_at_status || ""}
                        onChange={e => updateTask(i, "complete_at_status", e.target.value)}
                      >
                        <option value="">— Não automático —</option>
                        {JOB_STATUSES.map(st => (
                          <option key={st.value} value={st.value}>{st.label}</option>
                        ))}
                      </select>
                      {s.complete_at_status && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Concluída automaticamente em "{JOB_STATUSES.find(st => st.value === s.complete_at_status)?.label}" e etapas seguintes
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block flex items-center gap-1">
                        🔔 Notificar responsável ao chegar na etapa
                      </label>
                      <select
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        style={{ WebkitAppearance: "menulist", appearance: "menulist" }}
                        value={s.notify_on_status || ""}
                        onChange={e => updateTask(i, "notify_on_status", e.target.value)}
                      >
                        <option value="">— Sem notificação —</option>
                        {JOB_STATUSES.map(st => (
                          <option key={st.value} value={st.value}>{st.label}</option>
                        ))}
                      </select>
                      {s.notify_on_status && s.responsible_name && (
                        <p className="text-[10px] text-primary mt-1">
                          🔔 {s.responsible_name} será notificado quando o job chegar em "{JOB_STATUSES.find(st => st.value === s.notify_on_status)?.label}"
                        </p>
                      )}
                      {s.notify_on_status && !s.responsible_name && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          ⚠️ Defina um responsável para que a notificação seja enviada
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => removeTask(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Salvando..." : editingTemplate ? "Salvar" : "Criar Template"}
            </Button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}