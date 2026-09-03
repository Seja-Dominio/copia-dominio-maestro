import { useState } from "react";
import {
  ChevronRight, Clock, ArrowRightLeft, AlertTriangle,
  FileEdit, Type, Paperclip, CalendarDays, FolderPlus, Archive, Activity
} from "lucide-react";

const STATUS_LABELS = {
  pending_briefing: "Pend. Briefing",
  pending_capture: "Pend. Captação",
  pending_design: "Pend. Designer",
  pending_edit: "Pend. Edição",
  internal_approval: "Aprov. Interna",
  client_approval: "Aprov. Cliente",
  scheduled: "Agendado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const STATUS_ORDER = [
  "pending_briefing", "pending_capture", "pending_design",
  "pending_edit", "internal_approval", "client_approval",
  "scheduled", "completed"
];

function isRetrograde(oldStatus, newStatus) {
  if (!oldStatus || !newStatus || newStatus === "cancelled") return false;
  const oldIdx = STATUS_ORDER.indexOf(oldStatus);
  const newIdx = STATUS_ORDER.indexOf(newStatus);
  if (oldIdx === -1 || newIdx === -1) return false;
  return newIdx < oldIdx;
}

function Section({ icon: Icon, title, color, badge, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3 h-3 ${color}`} />
        <p className={`text-[10px] font-bold uppercase tracking-wide ${color}`}>{title}</p>
        {badge && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.bg}`}>{badge.text}</span>}
      </div>
      <div className="space-y-1 ml-4">{children}</div>
    </div>
  );
}

function Row({ dot, children, alert }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${alert ? "bg-destructive/10 -mx-2 px-2 py-0.5 rounded" : ""}`}>
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <span className="text-foreground truncate flex-1">{children}</span>
      {alert && <AlertTriangle className="w-3 h-3 text-destructive flex-shrink-0" />}
    </div>
  );
}

export default function DailySummaryCollaboratorRow({ summary }) {
  const [open, setOpen] = useState(false);
  const {
    collaborator: c, jobsCreated, timesheets, totalMinutes,
    statusChanges, retrogradeChanges, briefingEdits, captionEdits,
    attachmentActions, scheduleChanges, otherActions,
    projectsCreated, projectsArchived, clientNames, totalActions
  } = summary;
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);

  return (
    <div>
      <div
        className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: c.color || "hsl(var(--primary))" }}
        >
          {c.name?.[0]?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
          {clientNames.length > 0 && (
            <p className="text-[10px] text-muted-foreground truncate">
              {clientNames.slice(0, 3).join(", ")}{clientNames.length > 3 ? ` +${clientNames.length - 3}` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0 flex-wrap justify-end">
          {statusChanges.length > 0 && (
            <span className="flex items-center gap-1 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-0.5 rounded-full font-medium">
              <ArrowRightLeft className="w-3 h-3" />{statusChanges.length}
            </span>
          )}
          {retrogradeChanges.length > 0 && (
            <span className="flex items-center gap-1 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
              <AlertTriangle className="w-3 h-3" />{retrogradeChanges.length}
            </span>
          )}
          {totalMinutes > 0 && (
            <span className="flex items-center gap-1 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
              <Clock className="w-3 h-3" />{hours}h{mins > 0 ? `${mins}m` : ""}
            </span>
          )}
          <span className="flex items-center gap-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-full font-medium">
            <Activity className="w-3 h-3" />{totalActions}
          </span>
        </div>

        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </div>

      {open && (
        <div className="px-5 pb-4 pl-16 space-y-3 animate-fade-in">

          {/* 1. Status changes — most important */}
          {statusChanges.length > 0 && (
            <Section
              icon={ArrowRightLeft} title="Mudanças de Etapa" color="text-purple-600"
              badge={retrogradeChanges.length > 0 ? { text: `${retrogradeChanges.length} retrógrada(s)`, bg: "bg-destructive/15 text-destructive" } : null}
            >
              {statusChanges.map((h, i) => {
                const retro = isRetrograde(h.old_value, h.new_value);
                return (
                  <Row key={i} dot={retro ? "bg-destructive" : "bg-purple-500"} alert={retro}>
                    {STATUS_LABELS[h.old_value] || h.old_value || "?"} → {STATUS_LABELS[h.new_value] || h.new_value || "?"}
                    {retro && <span className="ml-1 text-destructive font-semibold text-[10px]">(RETROCESSO)</span>}
                  </Row>
                );
              })}
            </Section>
          )}

          {/* 2. Briefing edits */}
          {briefingEdits.length > 0 && (
            <Section icon={FileEdit} title="Edições de Briefing" color="text-blue-600">
              {briefingEdits.map((h, i) => (
                <Row key={i} dot="bg-blue-500">Briefing editado — Job #{h.job_id?.slice(-5)}</Row>
              ))}
            </Section>
          )}

          {/* 3. Caption edits */}
          {captionEdits.length > 0 && (
            <Section icon={Type} title="Edições de Legenda" color="text-cyan-600">
              {captionEdits.map((h, i) => (
                <Row key={i} dot="bg-cyan-500">Legenda editada — Job #{h.job_id?.slice(-5)}</Row>
              ))}
            </Section>
          )}

          {/* 4. Attachments */}
          {attachmentActions.length > 0 && (
            <Section icon={Paperclip} title="Anexos" color="text-amber-600">
              {attachmentActions.map((h, i) => (
                <Row key={i} dot="bg-amber-500">{h.text || (h.type === "attachment_add" ? "Anexo adicionado" : "Anexo removido")}</Row>
              ))}
            </Section>
          )}

          {/* 5. Schedule / cronograma */}
          {scheduleChanges.length > 0 && (
            <Section icon={CalendarDays} title="Cronograma (Data de postagem)" color="text-indigo-600">
              {scheduleChanges.map((h, i) => (
                <Row key={i} dot="bg-indigo-500">{h.text || `${h.old_value} → ${h.new_value}`}</Row>
              ))}
            </Section>
          )}

          {/* 6. Jobs created */}
          {jobsCreated.length > 0 && (
            <Section icon={FolderPlus} title="Jobs Criados" color="text-emerald-600">
              {jobsCreated.map(j => (
                <Row key={j.id} dot="bg-emerald-500">
                  {j.title}{j.client_name ? ` — ${j.client_name}` : ""}
                </Row>
              ))}
            </Section>
          )}

          {/* 7. Projects created */}
          {projectsCreated.length > 0 && (
            <Section icon={FolderPlus} title="Projetos Criados" color="text-teal-600">
              {projectsCreated.map(p => (
                <Row key={p.id} dot="bg-teal-500">{p.name}{p.client_name ? ` — ${p.client_name}` : ""}</Row>
              ))}
            </Section>
          )}

          {/* 8. Projects archived */}
          {projectsArchived.length > 0 && (
            <Section icon={Archive} title="Projetos Arquivados" color="text-slate-500">
              {projectsArchived.map(p => (
                <Row key={p.id} dot="bg-slate-400">{p.name}{p.client_name ? ` — ${p.client_name}` : ""}</Row>
              ))}
            </Section>
          )}

          {/* 9. Timesheets */}
          {timesheets.length > 0 && (
            <Section icon={Clock} title="Timesheet" color="text-green-600">
              {timesheets.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-foreground truncate">{t.job_title || "—"}</span>
                    {t.client_name && <span className="text-muted-foreground">— {t.client_name}</span>}
                  </div>
                  <span className="text-muted-foreground font-mono flex-shrink-0 ml-2">
                    {Math.floor((t.duration_minutes || 0) / 60)}h{String(Math.round((t.duration_minutes || 0) % 60)).padStart(2, "0")}m
                  </span>
                </div>
              ))}
            </Section>
          )}

          {/* 10. Other actions */}
          {otherActions.length > 0 && (
            <Section icon={Activity} title="Outras Ações" color="text-slate-500">
              {otherActions.map((h, i) => (
                <Row key={i} dot="bg-slate-400">{h.text}</Row>
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}