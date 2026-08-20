import { useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import * as XLSX from "xlsx";

function flattenData(data) {
  if (!data || data.length === 0) return [];
  return data;
}

async function exportPDFManual(sheets, filename, period) {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape" });

  const pageW = doc.internal.pageSize.width;
  const margin = 14;

  // Título
  doc.setFontSize(14);
  doc.setTextColor(30);
  doc.text(filename, margin, 16);

  // Período e data de geração
  doc.setFontSize(8);
  doc.setTextColor(120);
  let metaLine = `Gerado em ${new Date().toLocaleString("pt-BR")}`;
  if (period?.start && period?.end) {
    metaLine += `   |   Período: ${period.start} a ${period.end}`;
  }
  doc.text(metaLine, margin, 23);

  let yOffset = 31;

  sheets.forEach((sheet) => {
    const rows = sheet.rows;
    if (!rows || rows.length === 0) return;

    if (yOffset > 175) { doc.addPage(); yOffset = 20; }

    // Nome da seção
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(sheet.name, margin, yOffset);
    yOffset += 5;

    const cols = Object.keys(rows[0]);
    const usableW = pageW - margin * 2;
    const rowH = 5.5;
    // Distribui largura igual entre todas as colunas
    const colW = usableW / cols.length;

    // Header — fundo azul, texto branco, todos os campos
    doc.setFillColor(79, 70, 229);
    doc.setTextColor(255);
    doc.setFontSize(6.5);
    cols.forEach((col, i) => {
      doc.rect(margin + i * colW, yOffset, colW, rowH, "F");
      const label = String(col);
      // Truncar pelo espaço disponível, ~6px por char aprox
      const maxChars = Math.max(3, Math.floor(colW / 2.2));
      doc.text(label.slice(0, maxChars), margin + i * colW + 1.2, yOffset + 3.8);
    });
    yOffset += rowH;

    // Linhas de dados
    doc.setFontSize(6);
    doc.setTextColor(30);
    rows.forEach((row, ri) => {
      if (yOffset > 193) { doc.addPage(); yOffset = 20; }
      if (ri % 2 === 0) {
        doc.setFillColor(245, 245, 252);
        doc.rect(margin, yOffset, usableW, rowH, "F");
      }
      cols.forEach((col, i) => {
        const val = row[col] ?? "";
        const maxChars = Math.max(3, Math.floor(colW / 2.0));
        doc.text(String(val).slice(0, maxChars), margin + i * colW + 1.2, yOffset + 3.8);
      });
      yOffset += rowH;
    });

    yOffset += 8;
  });

  doc.save(`${filename}.pdf`);
}

export default function ExportButton({ getData, filename = "relatorio", period }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportXLSX() {
    setExporting(true);
    setOpen(false);
    const sheets = getData();
    const wb = XLSX.utils.book_new();

    const allSheets = Array.isArray(sheets) && sheets[0]?.name ? sheets : [{ name: "Relatório", rows: flattenData(sheets) }];
    allSheets.forEach(sheet => {
      const ws = XLSX.utils.json_to_sheet(sheet.rows || []);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
    });

    XLSX.writeFile(wb, `${filename}.xlsx`);
    setExporting(false);
  }

  async function exportPDF() {
    setExporting(true);
    setOpen(false);
    const sheets = getData();
    const allSheets = Array.isArray(sheets) && sheets[0]?.name ? sheets : [{ name: "Dados", rows: flattenData(sheets) }];
    await exportPDFManual(allSheets, filename, period);
    setExporting(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={exporting}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        <Download className="w-3.5 h-3.5" />
        {exporting ? "Exportando..." : "Exportar"}
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden w-44">
          <button
            onClick={exportXLSX}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            Exportar XLSX
          </button>
          <button
            onClick={exportPDF}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
          >
            <FileText className="w-4 h-4 text-red-600" />
            Exportar PDF
          </button>
        </div>
      )}
    </div>
  );
}