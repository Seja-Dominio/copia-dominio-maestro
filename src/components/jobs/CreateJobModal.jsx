import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fireJobCreatedNotifications } from "@/lib/jobNotifications";
import StandardDrawer from "@/components/ui/StandardDrawer";

const CONTENT_TYPES = [
  { value: "feed_card", label: "Card" },
  { value: "reels", label: "Reels" },
  { value: "story", label: "Story" },
  { value: "video", label: "Vídeo" },
  { value: "foto", label: "Foto" },
  { value: "promocao", label: "Promoção" },
  { value: "card_trafego", label: "Card de Tráfego" },
  { value: "video_trafego", label: "Vídeo de Tráfego" },
  { value: "trafego_pago", label: "Tráfego Pago" },
  { value: "email", label: "E-mail" },
  { value: "blog", label: "Blog" },
  { value: "outros", label: "Outros" },
];

export default function CreateJobModal({ onClose, onCreate, projectId, projectName, clientId, clientName, projectTeam }) {
  const [collaborators, setCollaborators] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const needsProjectSelection = !projectId;
  const [form, setForm] = useState({
    title: "",
    project_id: projectId || "",
    project_name: projectName || "",
    client_id: clientId || "",
    client_name: clientName || "",
    content_type: "feed_card",
    responsible_id: "",
    responsible_name: "",
    post_date: "",
    briefing: "",
    caption: "",
    template_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const promises = [
      base44.entities.Collaborator.filter({ is_active: true }, "name", 100),
      base44.entities.JobTemplate.list("name", 100),
    ];
    if (needsProjectSelection) {
      promises.push(base44.entities.Project.list("name", 500));
    }
    Promise.all(promises).then(([c, t, p]) => {
      setCollaborators(c);
      setTemplates(t);
      if (p) setProjects(p);

      // Auto-atribuir responsável = colaborador logado
      const session = sessionStorage.getItem("collaborator");
      if (session) {
        const collab = JSON.parse(session);
        setForm(f => ({ ...f, responsible_id: collab.id, responsible_name: collab.name }));
      }
    });
  }, [needsProjectSelection]);

  function handleTemplateChange(templateId) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    setForm(f => ({
      ...f,
      template_id: templateId,
      title: tpl.job_title || f.title,
      content_type: tpl.content_types?.[0] || tpl.content_type || f.content_type,
    }));
  }

  function handleResponsibleChange(collabId) {
    const collab = collaborators.find(c => c.id === collabId);
    setForm(f => ({
      ...f,
      responsible_id: collabId,
      responsible_name: collab?.name || "",
    }));
  }

  function handleProjectChange(projId) {
    const proj = projects.find(p => p.id === projId);
    setForm(f => ({
      ...f,
      project_id: projId,
      project_name: proj?.name || "",
      client_id: proj?.client_id || "",
      client_name: proj?.client_name || "",
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title || !form.project_id) return;
    setSaving(true);
    const tplData = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;
    const created = await base44.entities.Job.create({
      ...form,
      score: tplData?.score || form.score || 0,
    });

    // Se tem template com subtarefas, criar subtasks com datas baseadas em days_before_post
    if (selectedTemplateId) {
      const tpl = templates.find(t => t.id === selectedTemplateId);
      if (tpl?.subtasks?.length) {
        const subtaskPromises = tpl.subtasks.map(s => {
          let deadline = null;
          if (form.post_date && s.days_before_post != null && s.days_before_post !== "") {
            const postDate = new Date(form.post_date + "T12:00:00");
            postDate.setDate(postDate.getDate() - Number(s.days_before_post));
            deadline = postDate.toISOString().split("T")[0];
          }
          return base44.entities.Subtask.create({
            job_id: created.id,
            title: s.title,
            responsible_id: s.responsible_id || "",
            responsible_name: s.responsible_name || "",
            complete_at_status: s.complete_at_status || "",
            notify_on_status: s.notify_on_status || "",
            days_before_post: s.days_before_post || undefined,
            deadline,
            order: s.order || 0,
            status: "pending",
            is_completed: false,
          });
        });
        const createdSubtasks = await Promise.all(subtaskPromises);
        // Notifica responsáveis cujas subtarefas têm notify_on_status = status inicial do job
        fireJobCreatedNotifications(created, createdSubtasks);
      }
    }

    onCreate(created);
  }

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const drawerTitle = projectName ? `Novo Job — ${projectName}` : "Novo Job";

  const drawerFooter = (
    <div className="flex gap-3">
      <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
      <Button type="submit" form="create-job-form" disabled={saving} className="flex-1">
        {saving ? "Criando..." : "Criar Job"}
      </Button>
    </div>
  );

  return (
    <StandardDrawer open={true} onClose={onClose} title={drawerTitle} width={520} footer={drawerFooter}>
        <form id="create-job-form" onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Projeto (obrigatório quando acessado fora de um projeto) */}
          {needsProjectSelection && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Projeto *</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={form.project_id}
                onChange={e => handleProjectChange(e.target.value)}
                required
              >
                <option value="">Selecione um projeto...</option>
                {projects.filter(p => p.status !== "archived").map(p => (
                  <option key={p.id} value={p.id}>{p.client_name ? `${p.client_name} — ` : ""}{p.name}</option>
                ))}
              </select>
              {form.client_name && (
                <p className="text-[10px] text-muted-foreground mt-1">Cliente: {form.client_name}</p>
              )}
            </div>
          )}

          {/* Template */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Template (opcional){projectTeam && <span className="ml-1 normal-case font-normal text-muted-foreground">— equipe: {projectTeam}</span>}
            </label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedTemplateId}
              onChange={e => handleTemplateChange(e.target.value)}
            >
              <option value="">— Sem template —</option>
              {(() => {
                if (!projectTeam) return templates;
                const pt = projectTeam.toLowerCase().trim();
                const matched = templates.filter(t => {
                  if (t.teams?.length) return t.teams.some(tm => tm.toLowerCase().trim() === pt);
                  return t.team && t.team.toLowerCase().trim() === pt;
                });
                const others = templates.filter(t => !matched.includes(t));
                return [...matched, ...others];
              })().map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.teams?.length ? ` (${t.teams.join(", ")})` : t.team ? ` (${t.team})` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Título *</label>
            <Input placeholder="Ex: Post Carrossel — Produto X" value={form.title} onChange={set("title")} required />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Data de Post *</label>
            <Input
              type="date"
              value={form.post_date}
              onChange={set("post_date")}
              required

            />
            {selectedTemplateId && form.post_date && (() => {
              const tpl = templates.find(t => t.id === selectedTemplateId);
              const withDays = tpl?.subtasks?.filter(s => s.days_before_post);
              if (!withDays?.length) return null;
              return (
                <div className="mt-2 space-y-1">
                  {withDays.map((s, i) => {
                    const d = new Date(form.post_date + "T12:00:00");
                    d.setDate(d.getDate() - Number(s.days_before_post));
                    const label = d.toLocaleDateString("pt-BR");
                    return (
                      <p key={i} className="text-[10px] text-muted-foreground">
                        <span className="font-semibold">{s.title}</span>: prazo em {label} ({s.days_before_post}d antes)
                      </p>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Briefing</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Descreva o briefing do job..."
              value={form.briefing}
              onChange={set("briefing")}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Legenda</label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              rows={3}
              placeholder="Legenda do post..."
              value={form.caption}
              onChange={set("caption")}
            />
          </div>

        </form>
    </StandardDrawer>
  );
}