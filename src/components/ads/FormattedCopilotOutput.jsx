import ReactMarkdown from "react-markdown";

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function parseTableRow(line) {
  const normalized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, "|").trim());
}

function normalizeContent(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();
}

function splitMergedTableRow(line, columnCount) {
  const cells = parseTableRow(line);
  if (columnCount <= 0 || cells.length <= columnCount) return [cells];
  const rows = [];
  for (let index = 0; index < cells.length; index += columnCount) {
    rows.push(cells.slice(index, index + columnCount));
  }
  return rows;
}

function normalizeTableLines(content) {
  // Some model responses serialize newlines as literal "\\n" or place the
  // separator immediately after the header. Normalize both before parsing.
  return normalizeContent(content).replace(
    /(\|[^\n]+\|)\s+(\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?)(?=\s*(?:\n|$))/g,
    "$1\n$2",
  ).split("\n");
}

function parseJsonCandidate(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const markdownComponents = {
  h1: ({ children }) => <h3 className="mb-3 mt-1 text-lg font-bold text-foreground">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-2 mt-5 border-b border-border pb-2 text-sm font-bold uppercase tracking-wide text-foreground">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-2 mt-4 text-sm font-bold text-foreground">{children}</h5>,
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-3 rounded-r-lg border-l-4 border-primary bg-primary/5 px-3 py-2 text-muted-foreground">{children}</blockquote>,
  hr: () => <hr className="my-4 border-border" />,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-[0.9em]">{children}</code>,
};

function MarkdownBlock({ children, className = "" }) {
  return <div className={`leading-6 ${className}`}><ReactMarkdown components={markdownComponents}>{children}</ReactMarkdown></div>;
}

function MarkdownTable({ lines, index }) {
  const headers = parseTableRow(lines[0]);
  const rows = lines.slice(2).flatMap((line) => splitMergedTableRow(line, headers.length));
  return (
    <div key={`table-${index}`} className="my-4 overflow-x-auto rounded-lg border border-border" role="region" aria-label="Tabela de resultados">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>{headers.map((header, cellIndex) => <th key={cellIndex} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold"><ReactMarkdown components={markdownComponents}>{header}</ReactMarkdown></th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border last:border-0 even:bg-muted/20">
              {headers.map((_, cellIndex) => <td key={cellIndex} className="min-w-[120px] px-3 py-2 align-top"><ReactMarkdown components={markdownComponents}>{row[cellIndex] || "—"}</ReactMarkdown></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JsonTable({ rows }) {
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-border" role="region" aria-label="Tabela de dados">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-muted/70 text-[11px] uppercase tracking-wide text-muted-foreground"><tr>{columns.map(column => <th key={column} className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold">{column.replaceAll("_", " ")}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-border last:border-0 even:bg-muted/20">{columns.map(column => <td key={column} className="min-w-[120px] px-3 py-2 align-top"><JsonValue value={row[column]} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function formatJsonValue(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map(formatJsonValue).join(", ");
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key.replaceAll("_", " ")}: ${formatJsonValue(item)}`).join(" · ");
  return String(value);
}

function JsonValue({ value }) {
  if (value && typeof value === "object") return <JsonContent value={value} compact />;
  return <span>{formatJsonValue(value)}</span>;
}

function JsonContent({ value, compact = false }) {
  if (Array.isArray(value)) {
    if (value.length && value.every(item => item && typeof item === "object" && !Array.isArray(item))) return <JsonTable rows={value} />;
    return <ul className="space-y-1 pl-5">{value.map((item, index) => <li key={index}>{typeof item === "object" ? <JsonContent value={item} compact /> : formatJsonValue(item)}</li>)}</ul>;
  }
  if (value && typeof value === "object") {
    return <div className={compact ? "space-y-1" : "grid gap-3 sm:grid-cols-2"}>{Object.entries(value).map(([key, item]) => (
      <div key={key} className={compact ? "rounded-md bg-muted/30 px-2 py-1" : "rounded-lg border border-border bg-muted/20 p-3"}>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{key.replaceAll("_", " ")}</p>
        {item && typeof item === "object" ? <JsonContent value={item} compact /> : <p className="text-sm font-medium text-foreground">{formatJsonValue(item)}</p>}
      </div>
    ))}</div>;
  }
  return <p>{formatJsonValue(value)}</p>;
}

export default function FormattedCopilotOutput({ content }) {
  const json = parseJsonCandidate(content);
  if (json !== null) return <div className="rounded-lg border bg-background p-4 text-sm text-foreground sm:p-5"><JsonContent value={json} /></div>;

  const lines = normalizeTableLines(content);
  const blocks = [];
  let markdownLines = [];
  let index = 0;
  let blockIndex = 0;

  const flushMarkdown = () => {
    if (markdownLines.length) {
      blocks.push(<MarkdownBlock key={`markdown-${blockIndex++}`}>{markdownLines.join("\n")}</MarkdownBlock>);
      markdownLines = [];
    }
  };

  while (index < lines.length) {
    if (index + 1 < lines.length && lines[index].includes("|") && isTableSeparator(lines[index + 1])) {
      flushMarkdown();
      const tableLines = [lines[index], lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() && !isTableSeparator(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(<MarkdownTable key={`table-${blockIndex++}`} lines={tableLines} index={blockIndex} />);
      continue;
    }
    markdownLines.push(lines[index]);
    index += 1;
  }
  flushMarkdown();

  return <div className="rounded-lg border bg-background p-4 text-sm text-foreground sm:p-5">{blocks}</div>;
}
