import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, LayoutTemplate, Briefcase, FolderKanban, Edit2, Trash2, Copy,
  GripVertical, ChevronDown, ChevronRight, ChevronUp, ArrowUp, ArrowDown
} from "lucide-react";
import CreateJobTemplateModal from "../components/templates/CreateJobTemplateModal";
import { JOB_STATUSES } from "../components/templates/CreateJobTemplateModal";
import CreateProjectTemplateModal from "../components/templates/CreateProjectTemplateModal";

const TABS = [
  { id: "job", label: "Templates de Job", icon: Briefcase },
  { id: "project", label: "Templates de Projeto", icon: FolderKanban },
];

export default function Templates() {
  const [tab, setTab] = useState("job");
  const [jobTemplates, setJobTemplates] = useState([]);
  const [projectTemplates, setProjectTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingProjectTemplate, setEditingProjectTemplate] = useState(null);
  const [expandedTemplate, setExpandedTemplate] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [jt, pt] = await Promise.all([
      base44.entities.JobTemplate.list("-created_date", 100),
      base44.entities.ProjectTemplate.list("-created_date", 100),
    ]);
    setJobTemplates(jt);
    setProjectTemplates(pt);
    setLoading(false);
  }

  async function deleteTemplate(id, type) {
    if (type === "job") {
      await base44.entities.JobTemplate.delete(id);
      setJobTemplates(prev => prev.filter(t => t.id !== id));
    } else {
      await base44.entities.ProjectTemplate.delete(id);
      setProjectTemplates(prev => prev.filter(t => t.id !== id));
    }
  }

  async function duplicateTemplate(template, type) {
    const { id, created_date, updated_date, created_by, ...templateData } = template;
    const newData = {
      ...templateData,
      name: `${templateData.name} (Cópia)`
    };

    if (type === "job") {
      const created = await base44.entities.JobTemplate.create(newData);
      setJobTemplates(prev => [created, ...prev]);
    } else {
      const created = await base44.entities.ProjectTemplate.create(newData);
      setProjectTemplates(prev => [created, ...prev]);
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure estruturas padrão de jobs e projetos</p>
        </div>
        <Button onClick={() => tab === "job" ? setShowCreate(true) : setShowCreateProject(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="w-4 h-4" /> Novo Template
        </Button>
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

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card p-4 h-16 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : tab === "job" ? (
        <div className="space-y-3">
          {jobTemplates.length === 0 ? (
            <div className="text-center py-16">
              <LayoutTemplate className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">Nenhum template de job criado</p>
              <Button className="mt-4 gap-2" onClick={() => setShowCreate(true)}>
                <Plus className="w-4 h-4" /> Criar template
              </Button>
            </div>
          ) : (
            jobTemplates.map(template => (
              <div key={template.id} className="glass-card overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedTemplate(expandedTemplate === template.id ? null : template.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Briefcase className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{template.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {template.subtasks?.length || 0} tarefa(s)
                        {(template.content_types?.length || 0) > 0
                          ? ` · ${template.content_types.join(", ")}`
                          : template.content_type
                            ? ` · ${template.content_type}`
                            : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={e => { e.stopPropagation(); duplicateTemplate(template, "job"); }} title="Duplicar template">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={e => { e.stopPropagation(); setEditingTemplate(template); setShowCreate(true); }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={e => { e.stopPropagation(); deleteTemplate(template.id, "job"); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    {expandedTemplate === template.id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>

                {expandedTemplate === template.id && template.subtasks?.length > 0 && (
                  <div className="border-t border-border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Tarefas</p>
                    <div className="space-y-2">
                      {template.subtasks.map((st, i) => {
                        const statusLabel = st.complete_at_status
                          ? JOB_STATUSES.find(s => s.value === st.complete_at_status)?.label
                          : null;
                        return (
                          <div key={i} className="flex items-center gap-3 p-2.5 bg-muted/50 rounded-lg">
                            <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">{st.title}</p>
                              {statusLabel && (
                                <p className="text-xs text-muted-foreground">Conclui em: {statusLabel} (e etapas seguintes)</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projectTemplates.length === 0 ? (
            <div className="text-center py-16">
              <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">Nenhum template de projeto criado</p>
              <Button className="mt-4 gap-2" onClick={() => setShowCreateProject(true)}>
                <Plus className="w-4 h-4" /> Criar template
              </Button>
            </div>
          ) : (
            projectTemplates.map(t => (
              <div key={t.id} className="glass-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <FolderKanban className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.jobs?.length || 0} job(s) vinculados</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => duplicateTemplate(t, "project")} title="Duplicar template">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => { setEditingProjectTemplate(t); setShowCreateProject(true); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive" onClick={() => deleteTemplate(t.id, "project")}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showCreate && (
        <CreateJobTemplateModal
          editingTemplate={editingTemplate}
          onClose={() => { setShowCreate(false); setEditingTemplate(null); }}
          onCreate={template => {
            if (editingTemplate) {
              setJobTemplates(prev => prev.map(t => t.id === template.id ? template : t));
            } else {
              setJobTemplates(prev => [template, ...prev]);
            }
            setShowCreate(false);
            setEditingTemplate(null);
          }}
        />
      )}

      {showCreateProject && (
        <CreateProjectTemplateModal
          editingTemplate={editingProjectTemplate}
          onClose={() => { setShowCreateProject(false); setEditingProjectTemplate(null); }}
          onCreate={template => {
            if (editingProjectTemplate) {
              setProjectTemplates(prev => prev.map(t => t.id === template.id ? template : t));
            } else {
              setProjectTemplates(prev => [template, ...prev]);
            }
            setShowCreateProject(false);
            setEditingProjectTemplate(null);
          }}
        />
      )}
    </div>
  );
}