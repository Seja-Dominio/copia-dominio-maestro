import { jsPDF } from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatManaus } from "@/lib/dateUtils";

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

function isRetrograde(old_val, new_val) {
  if (!old_val || !new_val || new_val === "cancelled") return false;
  const oi = STATUS_ORDER.indexOf(old_val);
  const ni = STATUS_ORDER.indexOf(new_val);
  return oi !== -1 && ni !== -1 && ni < oi;
}

const PRIMARY = [27, 95, 170];
const PRIMARY_LIGHT = [220, 233, 248];
const GRAY_FILL = [245, 246, 250];
const TEXT_DARK = [30, 35, 50];
const TEXT_MED = [100, 105, 115];
const RED = [200, 50, 50];
const RED_LIGHT = [255, 235, 235];

function checkPage(doc, y, needed = 12) {
  if (y + needed > 282) { doc.addPage(); return 16; }
  return y;
}

function drawTableHeader(doc, y, cols, pageWidth) {
  doc.setFillColor(...PRIMARY);
  doc.rect(14, y, pageWidth - 28, 6, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  let x = 16;
  cols.forEach(col => { doc.text(col.label, x, y + 4); x += col.w; });
  doc.setTextColor(...TEXT_DARK);
  return y + 6;
}

function drawTableRow(doc, y, cols, values, pageWidth, isEven, highlight) {
  if (highlight) {
    doc.setFillColor(...RED_LIGHT);
    doc.rect(14, y, pageWidth - 28, 5.5, "F");
  } else if (isEven) {
    doc.setFillColor(...GRAY_FILL);
    doc.rect(14, y, pageWidth - 28, 5.5, "F");
  }
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...(highlight ? RED : TEXT_DARK));
  let x = 16;
  cols.forEach((col, i) => {
    doc.text(truncateText(doc, String(values[i] || "—"), col.w - 3), x, y + 3.8);
    x += col.w;
  });
  doc.setTextColor(...TEXT_DARK);
  return y + 5.5;
}

function sectionLabel(doc, y, text) {
  y = checkPage(doc, y, 12);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PRIMARY);
  doc.text(text, 16, y);
  doc.setTextColor(...TEXT_DARK);
  return y + 3;
}

export function generateDailyPDF(summaries, dateStr, label) {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  const tw = pw - 28; // table width
  let y = 16;

  const dateLabel = format(new Date(dateStr + "T12:00:00"), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  // ── Header bar ──
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 24, "F");
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Resumo Diário de Produtividade", 14, 10);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`${dateLabel}  |  ${label}`, 14, 16);
  doc.setFontSize(6.5);
  doc.text(`Gerado em: ${formatManaus(new Date(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`, 14, 21);
  doc.setTextColor(...TEXT_DARK);
  y = 30;

  // ── KPIs ──
  const totalChanges = summaries.reduce((s, c) => s + c.statusChanges.length, 0);
  const totalMins = summaries.reduce((s, c) => s + c.totalMinutes, 0);
  const totalActions = summaries.reduce((s, c) => s + c.totalActions, 0);
  const totalRetro = summaries.reduce((s, c) => s + (c.retrogradeChanges?.length || 0), 0);
  const totalClients = [...new Set(summaries.flatMap(c => c.clientNames))].length;

  const kpis = [
    { label: "Mudanças Etapa", value: totalChanges },
    { label: "Total Ações", value: totalActions },
    { label: "Horas", value: `${(totalMins / 60).toFixed(1)}h` },
    { label: "Clientes", value: totalClients },
  ];
  if (totalRetro > 0) kpis.push({ label: "⚠ Retrógradas", value: totalRetro, isAlert: true });

  const kpiW = (tw - (kpis.length - 1) * 2) / kpis.length;
  kpis.forEach((kpi, i) => {
    const kx = 14 + i * (kpiW + 2);
    doc.setFillColor(...(kpi.isAlert ? RED_LIGHT : PRIMARY_LIGHT));
    doc.roundedRect(kx, y, kpiW, 12, 1.5, 1.5, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(kpi.isAlert ? RED : PRIMARY));
    doc.text(String(kpi.value), kx + kpiW / 2, y + 7, { align: "center" });
    doc.setFontSize(5.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MED);
    doc.text(kpi.label, kx + kpiW / 2, y + 11, { align: "center" });
  });
  doc.setTextColor(...TEXT_DARK);
  y += 17;

  // ── Per collaborator ──
  summaries.forEach(summary => {
    const {
      collaborator: c, jobsCreated, timesheets, totalMinutes,
      statusChanges, retrogradeChanges = [], briefingEdits = [], captionEdits = [],
      attachmentActions = [], scheduleChanges = [], otherActions = [],
      projectsCreated = [], projectsArchived = [], clientNames
    } = summary;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);

    // Collab header
    y = checkPage(doc, y, 14);
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(14, y, tw, 7, 1.5, 1.5, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(c.name || "—", 17, y + 5);
    const statsR = `${statusChanges.length} etapas · ${hours}h${mins > 0 ? String(mins).padStart(2, "0") + "m" : ""} · ${summary.totalActions} ações`;
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.text(statsR, pw - 17 - doc.getTextWidth(statsR), y + 5);
    doc.setTextColor(...TEXT_DARK);
    y += 10;

    // ── 1. Status changes (most important) ──
    if (statusChanges.length > 0) {
      y = sectionLabel(doc, y, retrogradeChanges.length > 0
        ? `MUDANÇAS DE ETAPA (${retrogradeChanges.length} RETRÓGRADA${retrogradeChanges.length > 1 ? "S" : ""})`
        : "MUDANÇAS DE ETAPA");
      const scCols = [
        { label: "De", w: tw * 0.3 },
        { label: "Para", w: tw * 0.3 },
        { label: "Obs", w: tw * 0.4 },
      ];
      y = drawTableHeader(doc, y, scCols, pw);
      statusChanges.forEach((h, idx) => {
        y = checkPage(doc, y, 6);
        const retro = isRetrograde(h.old_value, h.new_value);
        const obs = retro ? "⚠ RETROCESSO" : "";
        y = drawTableRow(doc, y, scCols, [
          STATUS_LABELS[h.old_value] || h.old_value, STATUS_LABELS[h.new_value] || h.new_value, obs
        ], pw, idx % 2 === 0, retro);
      });
      y += 3;
    }

    // ── 2. Briefing edits ──
    if (briefingEdits.length > 0) {
      y = sectionLabel(doc, y, `EDIÇÕES DE BRIEFING (${briefingEdits.length})`);
      const bCols = [{ label: "Ação", w: tw * 0.5 }, { label: "Job ID", w: tw * 0.5 }];
      y = drawTableHeader(doc, y, bCols, pw);
      briefingEdits.forEach((h, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, bCols, ["Briefing editado", `#${h.job_id?.slice(-6)}`], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 3. Caption edits ──
    if (captionEdits.length > 0) {
      y = sectionLabel(doc, y, `EDIÇÕES DE LEGENDA (${captionEdits.length})`);
      const cCols = [{ label: "Ação", w: tw * 0.5 }, { label: "Job ID", w: tw * 0.5 }];
      y = drawTableHeader(doc, y, cCols, pw);
      captionEdits.forEach((h, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, cCols, ["Legenda editada", `#${h.job_id?.slice(-6)}`], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 4. Attachments ──
    if (attachmentActions.length > 0) {
      y = sectionLabel(doc, y, `ANEXOS (${attachmentActions.length})`);
      const aCols = [{ label: "Ação", w: tw }];
      y = drawTableHeader(doc, y, aCols, pw);
      attachmentActions.forEach((h, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, aCols, [h.text || "Anexo"], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 5. Schedule changes ──
    if (scheduleChanges.length > 0) {
      y = sectionLabel(doc, y, `CRONOGRAMA — DATA DE POSTAGEM (${scheduleChanges.length})`);
      const schCols = [{ label: "Descrição", w: tw }];
      y = drawTableHeader(doc, y, schCols, pw);
      scheduleChanges.forEach((h, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, schCols, [h.text || `${h.old_value} → ${h.new_value}`], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 6. Jobs created ──
    if (jobsCreated.length > 0) {
      y = sectionLabel(doc, y, `JOBS CRIADOS (${jobsCreated.length})`);
      const jCols = [{ label: "Título", w: tw * 0.5 }, { label: "Cliente", w: tw * 0.3 }, { label: "Tipo", w: tw * 0.2 }];
      y = drawTableHeader(doc, y, jCols, pw);
      jobsCreated.forEach((j, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, jCols, [j.title, j.client_name, j.content_type], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 7. Projects created ──
    if (projectsCreated.length > 0) {
      y = sectionLabel(doc, y, `PROJETOS CRIADOS (${projectsCreated.length})`);
      const pCols = [{ label: "Nome", w: tw * 0.5 }, { label: "Cliente", w: tw * 0.5 }];
      y = drawTableHeader(doc, y, pCols, pw);
      projectsCreated.forEach((p, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, pCols, [p.name, p.client_name], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 8. Projects archived ──
    if (projectsArchived.length > 0) {
      y = sectionLabel(doc, y, `PROJETOS ARQUIVADOS (${projectsArchived.length})`);
      const paCols = [{ label: "Nome", w: tw * 0.5 }, { label: "Cliente", w: tw * 0.5 }];
      y = drawTableHeader(doc, y, paCols, pw);
      projectsArchived.forEach((p, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, paCols, [p.name, p.client_name], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 9. Timesheets ──
    if (timesheets.length > 0) {
      y = sectionLabel(doc, y, `TIMESHEET (${timesheets.length})`);
      const tsCols = [
        { label: "Job", w: tw * 0.35 },
        { label: "Cliente", w: tw * 0.25 },
        { label: "Projeto", w: tw * 0.25 },
        { label: "Duração", w: tw * 0.15 },
      ];
      y = drawTableHeader(doc, y, tsCols, pw);
      timesheets.forEach((t, idx) => {
        y = checkPage(doc, y, 6);
        const dur = `${Math.floor((t.duration_minutes || 0) / 60)}h${String(Math.round((t.duration_minutes || 0) % 60)).padStart(2, "0")}m`;
        y = drawTableRow(doc, y, tsCols, [t.job_title, t.client_name, t.project_name, dur], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── 10. Other actions ──
    if (otherActions.length > 0) {
      y = sectionLabel(doc, y, `OUTRAS AÇÕES (${otherActions.length})`);
      const oCols = [{ label: "Descrição", w: tw }];
      y = drawTableHeader(doc, y, oCols, pw);
      otherActions.forEach((h, idx) => {
        y = checkPage(doc, y, 6);
        y = drawTableRow(doc, y, oCols, [h.text], pw, idx % 2 === 0);
      });
      y += 3;
    }

    // ── Clients ──
    if (clientNames.length > 0) {
      y = checkPage(doc, y, 8);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...PRIMARY);
      doc.text("CLIENTES ATENDIDOS: ", 16, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_DARK);
      const labelW = doc.getTextWidth("CLIENTES ATENDIDOS: ");
      doc.text(truncateText(doc, clientNames.join(", "), tw - labelW - 4), 16 + labelW, y);
      y += 5;
    }

    y += 3;
  });

  // ── Footer ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT_MED);
    doc.text(`Domínio Performance  ·  Página ${i}/${totalPages}`, pw / 2, 290, { align: "center" });
  }

  doc.save(`resumo-diario-${label.toLowerCase().replace(/\s+/g, "-")}-${dateStr}.pdf`);
}

function truncateText(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let t = text;
  while (doc.getTextWidth(t + "…") > maxWidth && t.length > 0) t = t.slice(0, -1);
  return t + "…";
}

export function generateProductivityReportCSV(summaries, dateLabel) {
  const rows = [];
  rows.push(["Período", "Colaborador", "Cargo", "Mudanças Etapa", "Horas", "Briefings", "Legendas", "Anexos", "Cronograma", "Jobs Criados", "Projetos Criados", "Clientes"].join(";"));
  summaries.forEach(s => {
    rows.push([dateLabel, s.collaborator.name, s.collaborator.role || "",
      s.statusChanges.length, (s.totalMinutes / 60).toFixed(1),
      s.briefingEdits?.length || 0, s.captionEdits?.length || 0,
      s.attachmentActions?.length || 0, s.scheduleChanges?.length || 0,
      s.jobsCreated.length, s.projectsCreated?.length || 0, s.clientNames.length
    ].join(";"));
  });
  return "\uFEFF" + rows.join("\n");
}