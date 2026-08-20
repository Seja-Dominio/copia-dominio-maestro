#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import XLSX from "xlsx";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

function usage() {
  console.log(`Uso:
  node scripts/import-base44-export.mjs --zip /caminho/Arquivo.zip --dry-run
  node scripts/import-base44-export.mjs --zip /caminho/Arquivo.zip
  node scripts/import-base44-export.mjs --zip /caminho/Arquivo.zip --verify

O modo padrão prepara o payload e envia para Supabase usando:
  SUPABASE_URL (ou VITE_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY

Sem --dry-run, a operação é idempotente por (entity, record_id) e usa upsert.
--verify somente lê o Supabase e compara entidades, IDs e datas de atualização.
`);
}

function argsFrom(argv) {
  const args = { dryRun: false, verify: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--zip") args.zip = argv[++i];
    else if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--verify") args.verify = true;
    else if (argv[i] === "--help" || argv[i] === "-h") args.help = true;
    else throw new Error(`Argumento desconhecido: ${argv[i]}`);
  }
  return args;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readExportRows(filePath) {
  const workbook = XLSX.readFile(filePath, { raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

async function extractZip(zipPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "base44-export-"));
  await execFileAsync("unzip", ["-q", "-o", zipPath, "-d", tempDir]);
  return tempDir;
}

async function loadRecords(zipPath) {
  const extracted = await extractZip(zipPath);
  const files = (await fs.readdir(extracted))
    .filter((file) => file.endsWith("_export.csv"))
    .sort();
  const records = [];

  for (const file of files) {
    const entity = file.replace(/_export\.csv$/, "");
    for (const payload of readExportRows(path.join(extracted, file))) {
      if (!payload.id) continue;
      records.push({
        entity,
        record_id: String(payload.id),
        payload,
        source_created_at: parseDate(payload.created_date),
        source_updated_at: parseDate(payload.updated_date),
      });
    }
  }

  return { records, files };
}

async function importRecords(records) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para importar.");
  }

  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/legacy_records?on_conflict=entity,record_id`;
  const batchSize = 500;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      throw new Error(`Supabase respondeu ${response.status}: ${await response.text()}`);
    }
    console.log(`Importados ${Math.min(offset + batch.length, records.length)}/${records.length}`);
  }

  const collaboratorRows = records
    .filter((record) => record.entity === "Collaborator")
    .map(({ record_id, payload, source_updated_at }) => {
      const { password_hash: _passwordHash, ...profile } = payload;
      return {
        id: record_id,
        login: String(payload.login || record_id),
        password_hash: String(payload.password_hash || ""),
        is_active: payload.is_active !== false,
        profile: { ...profile, id: record_id },
        source_updated_at,
      };
    });

  if (collaboratorRows.length) {
    const authEndpoint = `${url.replace(/\/$/, "")}/rest/v1/maestro_collaborators?on_conflict=id`;
    const response = await fetch(authEndpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(collaboratorRows),
    });
    if (!response.ok) {
      throw new Error(`Falha ao importar autenticação de colaboradores (${response.status}): ${await response.text()}`);
    }
    console.log(`Autenticação preparada para ${collaboratorRows.length} colaboradores.`);
  }
}

async function verifyRecords(records) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Defina SUPABASE_URL/VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para verificar.");
  }

  const baseUrl = `${url.replace(/\/$/, "")}/rest/v1/legacy_records`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const entities = [...new Set(records.map((record) => record.entity))];
  const remote = [];

  for (const entity of entities) {
    let offset = 0;
    while (true) {
      const response = await fetch(`${baseUrl}?select=entity,record_id,source_updated_at&entity=eq.${encodeURIComponent(entity)}`, {
        headers: { ...headers, Range: `${offset}-${offset + 999}` },
      });
      if (!response.ok) throw new Error(`Supabase respondeu ${response.status}: ${await response.text()}`);
      const batch = await response.json();
      remote.push(...batch);
      if (batch.length < 1000) break;
      offset += batch.length;
    }
  }

  const localByKey = new Map(records.map((record) => [`${record.entity}:${record.record_id}`, record]));
  const remoteByKey = new Map(remote.map((record) => [`${record.entity}:${record.record_id}`, record]));
  const missing = [...localByKey.keys()].filter((key) => !remoteByKey.has(key));
  const extra = [...remoteByKey.keys()].filter((key) => !localByKey.has(key));
  const mismatched = [...localByKey.keys()].filter((key) => {
    const local = localByKey.get(key);
    const current = remoteByKey.get(key);
    return current && local.source_updated_at !== current.source_updated_at;
  });

  console.log(`Destino: ${remote.length} registros`);
  console.log(`Ausentes: ${missing.length}`);
  console.log(`Extras: ${extra.length}`);
  console.log(`Datas divergentes: ${mismatched.length}`);
  if (missing.length || extra.length || mismatched.length) {
    console.log("Verificação falhou. Nenhuma alteração foi feita.");
    process.exitCode = 2;
  } else {
    console.log("Verificação aprovada: IDs e datas de atualização conferem.");
  }
}

const args = argsFrom(process.argv);
if (args.help || !args.zip) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const zipPath = path.resolve(ROOT, args.zip);
const stat = await fs.stat(zipPath);
if (!stat.isFile()) throw new Error(`Arquivo não encontrado: ${zipPath}`);

const { records, files } = await loadRecords(zipPath);
const counts = records.reduce((result, record) => {
  result[record.entity] = (result[record.entity] || 0) + 1;
  return result;
}, {});

console.log(`Arquivos CSV: ${files.length}`);
console.log(`Registros com ID: ${records.length}`);
console.table(counts);

if (args.verify) await verifyRecords(records);
else if (!args.dryRun) await importRecords(records);
else console.log("Dry-run: nenhuma alteração foi enviada ao Supabase.");
