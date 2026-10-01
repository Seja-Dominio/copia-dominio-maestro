import { createHash } from "node:crypto";

const OPERATOR_CHARACTERS = new Set("+-*/<>=~!@#%^&|");

export function tokenizeSql(sql) {
  const tokens = [];
  let index = 0;

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (/\s/.test(current)) {
      index += 1;
      continue;
    }
    if (current === "-" && next === "-") {
      index = sql.indexOf("\n", index + 2);
      if (index < 0) break;
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      let depth = 1;
      while (index < sql.length && depth) {
        if (sql[index] === "/" && sql[index + 1] === "*") { depth += 1; index += 2; }
        else if (sql[index] === "*" && sql[index + 1] === "/") { depth -= 1; index += 2; }
        else index += 1;
      }
      if (depth) throw new Error("Unterminated SQL block comment");
      continue;
    }
    if (current === "$") {
      const delimiter = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, index + delimiter.length);
        if (end < 0) throw new Error("Unterminated SQL dollar-quoted string");
        tokens.push(`dollar:${delimiter}${sql.slice(index + delimiter.length, end)}${delimiter}`);
        index = end + delimiter.length;
        continue;
      }
    }
    if (current === "'" || current === '"') {
      const quote = current;
      const start = index++;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === quote && sql[index + 1] === quote) { index += 2; continue; }
        if (sql[index] === quote) { index += 1; closed = true; break; }
        if (quote === "'" && sql[index] === "\\" && index + 1 < sql.length) index += 2;
        else index += 1;
      }
      if (!closed) throw new Error("Unterminated SQL quoted value");
      tokens.push(`${quote === "'" ? "string" : "quoted-identifier"}:${sql.slice(start, index)}`);
      continue;
    }
    if (/[A-Za-z_]/.test(current)) {
      const start = index++;
      while (index < sql.length && /[A-Za-z0-9_$]/.test(sql[index])) index += 1;
      tokens.push(`word:${sql.slice(start, index).toLowerCase()}`);
      continue;
    }
    if (/[0-9]/.test(current)) {
      const start = index++;
      while (index < sql.length && /[0-9A-Fa-f.xX_]/.test(sql[index])) index += 1;
      tokens.push(`number:${sql.slice(start, index).toLowerCase()}`);
      continue;
    }
    if (OPERATOR_CHARACTERS.has(current)) {
      const start = index++;
      while (index < sql.length && OPERATOR_CHARACTERS.has(sql[index])) index += 1;
      tokens.push(`operator:${sql.slice(start, index)}`);
      continue;
    }
    if (current !== ";") tokens.push(`punctuation:${current}`);
    index += 1;
  }

  return tokens;
}

export function fingerprintSqlStatements(statements) {
  if (!Array.isArray(statements)) throw new TypeError("SQL statements must be an array");
  const tokens = statements.flatMap((statement) => tokenizeSql(String(statement)));
  return createHash("sha256").update(JSON.stringify(tokens)).digest("hex");
}
