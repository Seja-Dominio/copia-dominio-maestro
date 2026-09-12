import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

const LOGO_HORIZONTAL_URL = "https://media.base44.com/images/public/69b0ac7e08d578f9756170a0/e61b9b073_a4.png";
const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69b0ac7e08d578f9756170a0/78bf96942_VERTICALSEMFUNDO.png";

const FORMAT_OPTIONS = [
  { value: "card",           label: "Card",             bg: [74,222,128] },
  { value: "reels",          label: "Reels",            bg: [96,165,250] },
  { value: "video_trafego",  label: "Vídeo Tráfego",    bg: [56,189,248] },
  { value: "card_trafego",   label: "Card Tráfego",     bg: [52,211,153] },
  { value: "foto",           label: "Foto",             bg: [251,191,36] },
  { value: "vt",             label: "VT",               bg: [251,146,60] },
  { value: "stories",        label: "Stories",          bg: [167,139,250] },
];

const TYPE_MAP = {
  feed_card: "card", reels: "reels", story: "stories", video: "vt",
  card_trafego: "card_trafego", video_trafego: "video_trafego", foto: "foto", promocao: "card",
};

function getFmtColor(fmtValue) {
  return FORMAT_OPTIONS.find(f => f.value === fmtValue)?.bg || [200,200,200];
}
function getFmtLabel(fmtValue) {
  return FORMAT_OPTIONS.find(f => f.value === fmtValue)?.label || fmtValue;
}

async function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function buildMergedSchedule(savedSchedule, jobs) {
  const merged = {};
  Object.entries(savedSchedule || {}).forEach(([dayStr, posts]) => {
    const drafts = posts.filter(p => !p.job_id && !p.job_created && !p.cancelled);
    if (drafts.length > 0) merged[dayStr] = [...drafts];
  });
  jobs.forEach(job => {
    if (!job.post_date || job.status === "cancelled") return;
    const fmt = TYPE_MAP[job.content_type] || "card";
    const post = { id: `job-${job.id}`, text: job.title || "Job", formats: [fmt], reference_url: job.reference_url };
    if (!merged[job.post_date]) merged[job.post_date] = [];
    merged[job.post_date].push(post);
  });
  return merged;
}

async function generateProjectPDF(project, logoImg, simboloImg) {
  const [projData, jobs] = await Promise.all([
    base44.entities.Project.filter({ id: project.id }, "id", 1),
    base44.entities.Job.filter({ project_id: project.id }, "-created_date", 300),
  ]);
  const savedSchedule = projData[0]?.schedule_data || {};
  const schedule = buildMergedSchedule(savedSchedule, jobs);

  // Determine the month from reference_month field, fallback to project name parsing
  const now = new Date();
  let targetDate = new Date(now.getFullYear(), now.getMonth(), 1);
  
  if (project.reference_month) {
    const [y, m] = project.reference_month.split("-").map(Number);
    targetDate = new Date(y, m - 1, 1);
  } else {
    // Fallback: try to detect month from project name
    const monthNames = {
      janeiro:1, fevereiro:2, "março":3, marco:3, abril:4, maio:5, junho:6,
      julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12,
    };
    const nameLower = (project.name || "").toLowerCase();
    for (const [mName, mNum] of Object.entries(monthNames)) {
      if (nameLower.includes(mName)) {
        const yearMatch = nameLower.match(/20\d{2}/);
        const year = yearMatch ? parseInt(yearMatch[0]) : now.getFullYear();
        targetDate = new Date(year, mNum - 1, 1);
        break;
      }
    }
  }

  const mStart = startOfMonth(targetDate);
  const mEnd = endOfMonth(targetDate);
  const monthLabel = format(targetDate, "MMMM 'de' yyyy", { locale: ptBR });
  const monthLabelUpper = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const firstDow = mStart.getDay();
  const daysInMonth = mEnd.getDate();
  const totalSlots = firstDow + daysInMonth;
  const totalWeeks = Math.ceil(totalSlots / 7);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 8;

  // Background
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, pageW, pageH, "F");

  // Watermark
  if (simboloImg) {
    const wmCanvas = document.createElement("canvas");
    wmCanvas.width = simboloImg.naturalWidth;
    wmCanvas.height = simboloImg.naturalHeight;
    const wmCtx = wmCanvas.getContext("2d");
    wmCtx.globalAlpha = 0.12;
    wmCtx.drawImage(simboloImg, 0, 0);
    const wmData = wmCanvas.toDataURL("image/png");
    const wmW = pageW * 0.4;
    const wmH = (simboloImg.naturalHeight / simboloImg.naturalWidth) * wmW;
    pdf.addImage(wmData, "PNG", (pageW - wmW) / 2, (pageH - wmH) / 2, wmW, wmH);
  }

  // Blue top bar
  pdf.setFillColor(30, 64, 175);
  pdf.rect(0, 0, pageW, 1.5, "F");

  // Logo
  let logoLeftEdge = pageW - M;
  if (logoImg) {
    const h = 9;
    const w = (logoImg.naturalWidth / logoImg.naturalHeight) * h;
    const canvas = document.createElement("canvas");
    canvas.width = logoImg.naturalWidth;
    canvas.height = logoImg.naturalHeight;
    canvas.getContext("2d").drawImage(logoImg, 0, 0);
    const logoX = pageW - M - w;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.7), "JPEG", logoX, M, w, h);
    logoLeftEdge = logoX;
  }

  // Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(30, 41, 59);
  pdf.text(`${project.client_name || project.name} — ${monthLabelUpper}`, M, M + 6);

  // Doc links — top-right, left of logo
  const docItems = [
    { link: projData[0]?.doc_link_1, label: projData[0]?.doc_label_1 },
    { link: projData[0]?.doc_link_2, label: projData[0]?.doc_label_2 },
  ].filter(item => item.link);
  let docRightY = M + 2;
  docItems.forEach((item, i) => {
    const displayLabel = item.label || `Doc ${i + 1}`;
    const prefix = "Clique aqui para acessar: ";
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(120, 120, 120);
    const prefixW = pdf.getTextWidth(prefix);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(220, 38, 38);
    const labelW = pdf.getTextWidth(displayLabel);
    const totalW = prefixW + labelW;
    const docX = logoLeftEdge - totalW - 3;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(120, 120, 120);
    pdf.text(prefix, docX, docRightY + 3);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(220, 38, 38);
    pdf.text(displayLabel, docX + prefixW, docRightY + 3);
    pdf.link(docX, docRightY + 0.5, totalW, 3.5, { url: item.link });
    pdf.setDrawColor(220, 38, 38);
    pdf.setLineWidth(0.15);
    pdf.line(docX + prefixW, docRightY + 3.5, docX + totalW, docRightY + 3.5);
    docRightY += 5;
  });
  const headerBottom = M + 10;

  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.line(M, headerBottom, pageW - M, headerBottom);

  // Calendar grid
  const calTop = headerBottom + 3;
  const calW = pageW - M * 2;
  const calH = pageH - calTop - M;
  const colW = calW / 7;
  const headerRowH = 5;
  const rowH = (calH - headerRowH) / totalWeeks;

  // Weekday headers
  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "bold");
  weekDays.forEach((wd, i) => {
    const x = M + i * colW;
    pdf.setTextColor(i === 0 || i === 6 ? 180 : 100, i === 0 || i === 6 ? 180 : 100, i === 0 || i === 6 ? 180 : 100);
    pdf.text(wd, x + colW / 2, calTop + 3.5, { align: "center" });
  });

  const gridTop = calTop + headerRowH;
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.15);

  // Draw grid + posts
  for (let week = 0; week < totalWeeks; week++) {
    for (let dow = 0; dow < 7; dow++) {
      const slotIdx = week * 7 + dow;
      const dayNum = slotIdx - firstDow + 1;
      const x = M + dow * colW;
      const y = gridTop + week * rowH;

      // Cell border
      pdf.setDrawColor(235, 235, 235);
      pdf.rect(x, y, colW, rowH);

      if (dayNum < 1 || dayNum > daysInMonth) {
        pdf.setFillColor(248, 248, 248);
        pdf.rect(x, y, colW, rowH, "F");
        continue;
      }

      const dayStr = format(new Date(mStart.getFullYear(), mStart.getMonth(), dayNum), "yyyy-MM-dd");
      const isToday = format(new Date(), "yyyy-MM-dd") === dayStr;

      // Day number
      pdf.setFontSize(6);
      pdf.setFont("helvetica", "bold");
      if (isToday) {
        pdf.setFillColor(37, 99, 235);
        pdf.circle(x + 3.5, y + 3, 2, "F");
        pdf.setTextColor(255, 255, 255);
      } else {
        pdf.setTextColor(120, 120, 120);
      }
      pdf.text(String(dayNum), x + 3.5, y + 3.8, { align: "center" });

      // Posts
      const dayPosts = schedule[dayStr] || [];
      let postY = y + 6.5;
      const maxPostY = y + rowH - 1;
      const cardPad = 1.5;
      const cardX = x + cardPad;
      const cardW = colW - cardPad * 2;

      dayPosts.forEach(post => {
        if (postY + 3 > maxPostY) return;
        const fmt = post.formats?.[0];
        const [r, g, b] = getFmtColor(fmt);
        const cardStartY = postY - 1.5;

        // Card background
        pdf.setFillColor(r, g, b, 0.12);
        pdf.setDrawColor(r, g, b);
        pdf.setLineWidth(0.3);

        // Measure card height first
        let tempY = postY;
        tempY += 3; // badge
        let titleLines = [];
        if (post.text) {
          pdf.setFontSize(4);
          pdf.setFont("helvetica", "normal");
          titleLines = pdf.splitTextToSize(post.text, cardW - 2);
          titleLines = titleLines.slice(0, 3);
          tempY += titleLines.length * 2.2;
        }
        if (post.reference_url) tempY += 2.5;
        const cardH = tempY - cardStartY + 1;

        // Draw card bg (light tint) + left accent border
        const bgR = Math.round(255 - (255 - r) * 0.15);
        const bgG = Math.round(255 - (255 - g) * 0.15);
        const bgB = Math.round(255 - (255 - b) * 0.15);
        pdf.setFillColor(bgR, bgG, bgB);
        pdf.roundedRect(cardX, cardStartY, cardW, cardH, 0.6, 0.6, "F");
        pdf.setFillColor(r, g, b);
        pdf.rect(cardX, cardStartY, 0.8, cardH, "F");

        // Badge
        pdf.setFillColor(r, g, b);
        const badgeLabel = getFmtLabel(fmt);
        pdf.setFontSize(4.5);
        pdf.setFont("helvetica", "bold");
        const badgeW = pdf.getTextWidth(badgeLabel) + 2;
        const badgeX = cardX + (cardW - badgeW) / 2;
        pdf.roundedRect(badgeX, postY - 1.5, badgeW, 3, 0.8, 0.8, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.text(badgeLabel, badgeX + badgeW / 2, postY + 0.5, { align: "center" });
        postY += 3;

        // Title — left-aligned
        if (post.text && postY + 2 <= maxPostY) {
          pdf.setFontSize(4);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(50, 50, 50);
          for (let li = 0; li < titleLines.length && postY + 2 <= maxPostY; li++) {
            pdf.text(titleLines[li], cardX + 1.5, postY + 1.2);
            postY += 2.2;
          }
        }

        // Reference URL label
        if (post.reference_url && postY + 2 <= maxPostY) {
          pdf.setFontSize(3.5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(220, 38, 38);
          const linkLabel = "\uD83D\uDD17 Referência";
          const linkW = pdf.getTextWidth(linkLabel);
          const linkX = cardX + (cardW - linkW) / 2;
          pdf.text(linkLabel, linkX, postY + 1);
          pdf.setDrawColor(220, 38, 38);
          pdf.setLineWidth(0.1);
          pdf.line(linkX, postY + 1.3, linkX + linkW, postY + 1.3);
          postY += 2.5;
        }

        // Make entire card clickable if has reference_url
        if (post.reference_url) {
          pdf.link(cardX, cardStartY, cardW, cardH, { url: post.reference_url });
        }

        postY += 1.5;
      });
    }
  }

  return pdf;
}

export default function BulkScheduleDownload({ projects, teamFilter, getEffectiveStatus }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  async function handleDownload() {
    // Filter only active (non-archived, non-completed) projects matching team
    const eligible = projects.filter(p => {
      const status = getEffectiveStatus(p);
      if (status === "archived" || status === "completed") return false;
      if (!teamFilter) return true;
      return p.teams?.includes(teamFilter) || p.team === teamFilter;
    });

    if (eligible.length === 0) return;

    setDownloading(true);
    setProgress({ current: 0, total: eligible.length });

    const [logoImg, simboloImg] = await Promise.all([
      loadImage(LOGO_HORIZONTAL_URL),
      loadImage(LOGO_URL),
    ]);

    for (let i = 0; i < eligible.length; i++) {
      setProgress({ current: i + 1, total: eligible.length });
      const proj = eligible[i];
      const pdf = await generateProjectPDF(proj, logoImg, simboloImg);
      const pdfTargetDate = proj.reference_month
        ? new Date(Number(proj.reference_month.split("-")[0]), Number(proj.reference_month.split("-")[1]) - 1, 1)
        : new Date();
      const monthStr = format(pdfTargetDate, "MMMM_yyyy", { locale: ptBR });
      pdf.save(`Cronograma-${proj.client_name || proj.name}_${monthStr}.pdf`);
      // Small delay between downloads so browser doesn't block them
      if (i < eligible.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setDownloading(false);
  }

  const eligibleCount = projects.filter(p => {
    const status = getEffectiveStatus(p);
    if (status === "archived" || status === "completed") return false;
    if (!teamFilter) return true;
    return p.teams?.includes(teamFilter) || p.team === teamFilter;
  }).length;

  return (
    <Button
      variant="outline"
      onClick={handleDownload}
      disabled={downloading || eligibleCount === 0}
      className="gap-2"
      title={`Baixar ${eligibleCount} cronograma(s)${teamFilter ? ` da equipe ${teamFilter}` : ""}`}
    >
      {downloading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          {progress.current}/{progress.total}
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          Cronogramas ({eligibleCount})
        </>
      )}
    </Button>
  );
}