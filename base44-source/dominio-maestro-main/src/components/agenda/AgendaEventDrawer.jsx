import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { X, Save, Trash2 } from "lucide-react";
import { useConfirmDelete } from "@/components/ConfirmDeleteContext";
import { safeDelete } from "@/lib/safeDelete";
import { Button } from "@/components/ui/button";
import { MobileSelect } from "@/components/ui/bottom-sheet";
import ClientComboField from "./ClientComboField";
import CollaboratorComboField from "./CollaboratorComboField";

function getApiErrorMessage(error, action) {
  const detail = error?.response?.data?.message || error?.data?.message || error?.message;
  return detail
    ? `${action}: ${detail}`
    : `${action}. Verifique sua sessão e tente novamente.`;
}

function addMinutes(timeStr, minutes) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function getDefaultDuration(activityType) {
  try {
    const stored = JSON.parse(localStorage.getItem("agendaActivityConfig") || "null");
    if (stored) {
      const act = stored.find(a => a.key === activityType);
      if (act?.default_duration) return act.default_duration;
    }
  } catch {}
  return 60; // fallback 1h
}

export default function AgendaEventDrawer({ event, defaultDate, collaborators, clients, activityConfig = {}, onClose, onSaved }) {
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const nowTime = format(now, "HH:mm");

  const activityOptions = Object.entries(activityConfig).map(([k, v]) => ({ value: k, label: v.label }));

  const initialActivity = event?.activity_type || activityOptions[0]?.value || "reuniao_comercial";
  const initialTime = event?.time || nowTime;
  const initialEndTime = event?.end_time || addMinutes(initialTime, getDefaultDuration(initialActivity));

  const [form, setForm] = useState({
    title: event?.title || "",
    date: event?.date || defaultDate || todayStr,
    time: initialTime,
    end_time: initialEndTime,
    activity_type: initialActivity,
    collaborator_id: event?.collaborator_id || "",
    collaborator_name: event?.collaborator_name || "",
    client_id: event?.client_id || "",
    client_name: event?.client_name || "",
    status: event?.status || "agendado",
    notes: event?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const confirmDelete = useConfirmDelete();

  useEffect(() => {
    if (!event && defaultDate) {
      setForm(f => ({ ...f, date: defaultDate }));
    }
  }, [defaultDate, event]);

  // When activity changes (new event only), update end_time based on default duration
  function handleActivityChange(val) {
    const duration = getDefaultDuration(val);
    setForm(f => ({
      ...f,
      activity_type: val,
      end_time: addMinutes(f.time, duration),
    }));
  }

  // When start time changes, recalculate end_time
  function handleTimeChange(val) {
    const duration = getDefaultDuration(form.activity_type);
    setForm(f => ({
      ...f,
      time: val,
      end_time: addMinutes(val, duration),
    }));
  }

  function setCollab(id) {
    const c = collaborators.find(x => x.id === id);
    setForm(f => ({ ...f, collaborator_id: id, collaborator_name: c?.name || "" }));
  }

  function setClient(id) {
    const c = clients.find(x => x.id === id);
    setForm(f => ({ ...f, client_id: id, client_name: c?.name || "" }));
  }

  async function handleSave() {
    if (!form.title || !form.date || !form.activity_type || saving) return;
    setSaving(true);
    setErrorMessage("");
    try {
      if (event) {
        await base44.entities.AgendaEvent.update(event.id, form);
      } else {
        await base44.entities.AgendaEvent.create(form);
      }
      onSaved();
    } catch (error) {
      console.error("AgendaEvent save failed:", error);
      setErrorMessage(getApiErrorMessage(
        error,
        event ? "Não foi possível atualizar o evento" : "Não foi possível criar o evento"
      ));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event || saving) return;
    const confirmed = await confirmDelete({ title: "Excluir evento?", message: `"${event.title}" será permanentemente removido.` });
    if (!confirmed) return;

    setSaving(true);
    setErrorMessage("");
    try {
      await safeDelete("agenda_event", "AgendaEvent", event);
      onSaved();
    } catch (error) {
      console.error("AgendaEvent delete failed:", error);
      setErrorMessage(getApiErrorMessage(error, "Não foi possível excluir o evento"));
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey && form.title && form.date) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") onClose();
  }

  const labelCls = "text-xs font-bold text-muted-foreground uppercase tracking-wide block no-touch-min";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in w-[calc(100%-40px)] max-w-[480px] max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-sm font-bold text-foreground">{event ? "Editar Evento" : "Novo Evento"}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ display: "flex", flexDirection: "column", gap: "26px" }}>

          {/* Título */}
          <div>
            <label className={labelCls} style={{ marginBottom: "6px" }}>Título *</label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder="Ex: Reunião de alinhamento"
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Atividade (moved above date) */}
          <div>
            <label className={labelCls} style={{ marginBottom: "6px" }}>Atividade *</label>
            <MobileSelect
              value={form.activity_type}
              onChange={handleActivityChange}
              options={activityOptions}
              placeholder="Selecionar atividade"
            />
          </div>

          {/* Data */}
          <div>
            <label className={labelCls} style={{ marginBottom: "6px" }}>Data *</label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              onClick={e => e.target.showPicker?.()}
              className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            />
          </div>

          {/* Horário início / término */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} style={{ marginBottom: "6px" }}>Início</label>
              <input
                type="time"
                value={form.time}
                onChange={e => handleTimeChange(e.target.value)}
                onClick={e => e.target.showPicker?.()}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              />
            </div>
            <div>
              <label className={labelCls} style={{ marginBottom: "6px" }}>Término</label>
              <input
                type="time"
                value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                onClick={e => e.target.showPicker?.()}
                className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              />
            </div>
          </div>

          {/* Colaborador */}
          <CollaboratorComboField
            value={form.collaborator_name}
            collaborators={collaborators}
            labelCls={labelCls}
            onChange={(name, id) => setForm(f => ({ ...f, collaborator_name: name, collaborator_id: id }))}
          />

          {/* Cliente */}
          <ClientComboField
            value={form.client_name}
            clients={clients}
            labelCls={labelCls}
            onChange={(name, id) => setForm(f => ({ ...f, client_name: name, client_id: id }))}
          />

          {/* Status */}
          <div>
            <label className={labelCls} style={{ marginBottom: "6px" }}>Status</label>
            <MobileSelect
              value={form.status}
              onChange={val => setForm(f => ({ ...f, status: val }))}
              options={[
                { value: "agendado",  label: "Agendado" },
                { value: "realizado", label: "Realizado" },
                { value: "noshow",    label: "No-show" },
                { value: "cancelado", label: "Cancelado" },
              ]}
              placeholder="Status"
            />
          </div>

          {/* Observações */}
          <div>
            <label className={labelCls} style={{ marginBottom: "6px" }}>Observações</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Detalhes do evento..."
              className="w-full h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

        </div>

        {errorMessage && (
          <div role="alert" className="mx-5 mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-2 flex-shrink-0 bg-card">
          {event && (
            <Button variant="outline" size="icon" onClick={handleDelete} disabled={saving} className="text-destructive hover:bg-destructive/10 border-destructive/30">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button variant="outline" className="flex-1 h-9 text-sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="flex-1 h-9 text-sm" onClick={handleSave} disabled={saving || !form.title || !form.date}>
            <Save className="w-4 h-4" /> {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}