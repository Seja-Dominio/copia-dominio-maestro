#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { Client } from "pg";
import { assertConfirmedDevDatabaseTarget, assertConfirmedProductionDatabaseSource } from "./lib/verified-dev-database.mjs";

const DEFAULT_ENTITIES = ["Client", "Project", "Job", "Subtask", "JobHistory", "AgendaEvent", "Collaborator"];
const BATCH_SIZE = 500;

function usage() {
  console.log(`Uso:
  node scripts/sync-prod-to-dev.mjs --allow-production-read --dry-run
  node scripts/sync-prod-to-dev.mjs --allow-production-read --apply
  node scripts/sync-prod-to-dev.mjs --allow-production-read --apply --reconcile
  node scripts/sync-prod-to-dev.mjs --allow-production-read --entities Job,Subtask,JobHistory --dry-run

Variáveis obrigatórias:
  SUPABASE_PROD_DB_URL  URL de conexão do banco Prod (origem)
  SUPABASE_CONFIRMED_PROD_PROJECT_REF ref de Produção conferido no Dashboard
  SUPABASE_DEV_DB_URL   URL de conexão do banco Dev (destino)
  SUPABASE_CONFIRMED_DEV_PROJECT_REF ref de Dev conferido no Dashboard

--allow-production-read é obrigatório porque qualquer modo lê o banco de Produção.
O padrão, após confirmação explícita das duas refs, é somente leitura. --apply atualiza ou insere registros no Dev.
--reconcile também remove do Dev registros extras somente nas entidades selecionadas.
Credenciais da tabela maestro_collaborators não são copiadas.
`);
}

function parseArgs(argv) {
  const args = { dryRun: false, apply: false, reconcile: false, allowProductionRead: false, entities: DEFAULT_ENTITIES };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") args.dryRun = true;
    else if (value === "--apply") args.apply = true;
    else if (value === "--reconcile") args.reconcile = true;
    else if (value === "--allow-production-read") args.allowProductionRead = true;
    else if (value === "--entities") {
      args.entities = String(argv[++index] || "")
        .split(",")
        .map((entity) => entity.trim())
        .filter(Boolean);
    } else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Argumento desconhecido: ${value}`);
  }
  if (!args.dryRun && !args.apply) args.dryRun = true;
  if (args.dryRun && args.apply) throw new Error("Use somente --dry-run ou --apply.");
  if (args.reconcile && !args.apply) throw new Error("--reconcile exige --apply.");
  if (!args.entities.length) throw new Error("Informe ao menos uma entidade.");
  return args;
}

function payloadHash(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload ?? {})).digest("hex");
}

function keyOf(row) {
  return `${row.entity}:${row.record_id}`;
}

function sameRecord(left, right) {
  return left.source_updated_at?.toISOString?.() === right.source_updated_at?.toISOString?.()
    && payloadHash(left.payload) === payloadHash(right.payload);
}

async function loadRecords(client, entities) {
  const { rows } = await client.query(
    `select entity, record_id, payload, source_created_at, source_updated_at
     from public.legacy_records
     where entity = any($1::text[])
     order by entity, record_id`,
    [entities],
  );
  return rows;
}

function summarize(sourceRows, destinationRows, entities) {
  const source = new Map(sourceRows.map((row) => [keyOf(row), row]));
  const destination = new Map(destinationRows.map((row) => [keyOf(row), row]));
  const summary = entities.map((entity) => {
    const sourceEntity = sourceRows.filter((row) => row.entity === entity);
    const destinationEntity = destinationRows.filter((row) => row.entity === entity);
    const sourceKeys = new Set(sourceEntity.map(keyOf));
    const destinationKeys = new Set(destinationEntity.map(keyOf));
    const added = sourceEntity.filter((row) => !destination.has(keyOf(row))).length;
    const changed = sourceEntity.filter((row) => destination.has(keyOf(row)) && !sameRecord(row, destination.get(keyOf(row)))).length;
    const equal = sourceEntity.length - added - changed;
    const extra = destinationEntity.filter((row) => !sourceKeys.has(keyOf(row))).length;
    return { entity, prod: sourceEntity.length, dev: destinationEntity.length, novos: added, alterados: changed, iguais: equal, extrasNoDev: extra };
  });
  return { source, destination, summary };
}

async function upsertBatch(client, rows) {
  if (!rows.length) return;
  const values = [];
  const placeholders = rows.map((row, index) => {
    const base = index * 5;
    values.push(row.entity, row.record_id, row.payload, row.source_created_at, row.source_updated_at);
    return `($${base + 1}, $${base + 2}, $${base + 3}::jsonb, $${base + 4}, $${base + 5})`;
  }).join(",");
  await client.query(
    `insert into public.legacy_records(entity, record_id, payload, source_created_at, source_updated_at)
     values ${placeholders}
     on conflict (entity, record_id) do update set
       payload = excluded.payload,
       source_created_at = excluded.source_created_at,
       source_updated_at = excluded.source_updated_at,
       imported_at = now()`,
    values,
  );
}

async function deleteExtraBatch(client, rows) {
  if (!rows.length) return;
  await client.query(
    "delete from public.legacy_records where entity = $1 and record_id = any($2::text[])",
    [rows[0].entity, rows.map((row) => row.record_id)],
  );
}

function printSummary(summary, mode) {
  console.log(`Modo: ${mode}`);
  console.table(summary);
  const totals = summary.reduce((result, row) => {
    for (const field of ["prod", "dev", "novos", "alterados", "iguais", "extrasNoDev"]) result[field] += row[field];
    return result;
  }, { prod: 0, dev: 0, novos: 0, alterados: 0, iguais: 0, extrasNoDev: 0 });
  console.log("Totais:", totals);
}

const args = parseArgs(process.argv);
if (args.help) {
  usage();
  process.exit(0);
}
if (!args.allowProductionRead) {
  throw new Error("Este utilitário lê Produção mesmo em --dry-run. Informe --allow-production-read após autorização específica.");
}

const prodUrl = process.env.SUPABASE_PROD_DB_URL;
const devUrl = process.env.SUPABASE_DEV_DB_URL;
if (!prodUrl || !devUrl) throw new Error("Defina SUPABASE_PROD_DB_URL e SUPABASE_DEV_DB_URL. As URLs não devem ser colocadas no Git.");
assertConfirmedProductionDatabaseSource(prodUrl, process.env.SUPABASE_CONFIRMED_PROD_PROJECT_REF);
assertConfirmedDevDatabaseTarget(devUrl, process.env.SUPABASE_CONFIRMED_DEV_PROJECT_REF);

const prod = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
const dev = new Client({ connectionString: devUrl, ssl: { rejectUnauthorized: false } });

try {
  // Conectar em sequência evita timeout de auth_query em projetos pequenos usando o pooler.
  await prod.connect();
  const sourceRows = await loadRecords(prod, args.entities);
  await dev.connect();
  const destinationRows = await loadRecords(dev, args.entities);
  const { source, destination, summary } = summarize(sourceRows, destinationRows, args.entities);
  printSummary(summary, args.apply ? (args.reconcile ? "aplicar + reconciliar" : "aplicar sem exclusões") : "conferência somente leitura");

  if (args.apply) {
    await dev.query("begin");
    try {
      for (let offset = 0; offset < sourceRows.length; offset += BATCH_SIZE) {
        await upsertBatch(dev, sourceRows.slice(offset, offset + BATCH_SIZE));
      }
      if (args.reconcile) {
        const extras = destinationRows.filter((row) => !source.has(keyOf(row)));
        for (let offset = 0; offset < extras.length; offset += BATCH_SIZE) {
          await deleteExtraBatch(dev, extras.slice(offset, offset + BATCH_SIZE));
        }
      }
      await dev.query("commit");
    } catch (error) {
      await dev.query("rollback");
      throw error;
    }

    const verifiedRows = await loadRecords(dev, args.entities);
    const verification = summarize(sourceRows, verifiedRows, args.entities);
    const failed = verification.summary.some((row) => row.novos > 0 || row.alterados > 0 || (args.reconcile && row.extrasNoDev > 0));
    printSummary(verification.summary, failed ? "verificação falhou" : "verificação após sincronização");
    if (failed) process.exitCode = 2;
  }
} finally {
  await Promise.allSettled([prod.end(), dev.end()]);
}
