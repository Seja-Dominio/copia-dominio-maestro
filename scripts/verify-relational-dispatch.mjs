import fs from "node:fs/promises";
import { verifySubtaskTransferContract } from "./lib/subtask-transfer-contract.mjs";

const envPath = new URL("../.env.production.local", import.meta.url);
const contractPath = new URL("./config/relational-read-entities.json", import.meta.url);
const sourcePath = new URL("../supabase/functions/maestro-data/index.ts", import.meta.url);
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const envText = await fs.readFile(envPath, "utf8").catch(() => "");
const contractEntities = JSON.parse(await fs.readFile(contractPath, "utf8"));
const source = await fs.readFile(sourcePath, "utf8");
const errors = [];
const migrationNames = (await fs.readdir(migrationDirectory)).filter((name) => name.endsWith("_transfer_subtasks_relational_atomic.sql"));
const transferMigration = migrationNames.length === 1
  ? await fs.readFile(new URL(`../supabase/migrations/${migrationNames[0]}`, import.meta.url), "utf8")
  : "";
if (migrationNames.length !== 1) errors.push(`transferSubtasks: esperada exatamente uma migration relacional, encontradas ${migrationNames.length}`);
const subtaskTransferErrors = verifySubtaskTransferContract({ edgeSource: source, migrationSource: transferMigration });
errors.push(...subtaskTransferErrors);

const envEntities = new Set(
  (envText.match(/^VITE_MAESTRO_RELATIONAL_READS=(.*)$/m)?.[1] || "")
    .split(",")
    .map((entity) => entity.trim())
    .filter(Boolean),
);
const configuredEntities = new Set(contractEntities);
const relationalSets = [...source.matchAll(/const RELATIONAL_[A-Z_]+_ENTITIES = new Set\(\[([^\]]*)\]\);/g)];
const serverEntities = new Set(relationalSets.flatMap(([, values]) => [...values.matchAll(/"([^"]+)"/g)].map(([, entity]) => entity)));

if (!configuredEntities.size) errors.push("scripts/config/relational-read-entities.json está vazio");
if (configuredEntities.size !== contractEntities.length) errors.push("scripts/config/relational-read-entities.json contém entidades duplicadas");
if (envText.includes("VITE_MAESTRO_RELATIONAL_READS=")
  && JSON.stringify([...envEntities].sort()) !== JSON.stringify([...configuredEntities].sort())) {
  errors.push(".env.production.local diverge de scripts/config/relational-read-entities.json");
}
for (const entity of configuredEntities) {
  if (!serverEntities.has(entity)) errors.push(`${entity}: configurado no frontend, mas sem dispatcher relacional no backend`);
  if (!source.includes(`|| RELATIONAL_${entity === "DominusWebhookParsed" ? "WEBHOOK" : "UNKNOWN"}_ENTITIES.has(entity)`)
    && entity === "DominusWebhookParsed") {
    errors.push(`${entity}: dispatcher não declara a entidade na resposta read_source`);
  }
}

if (configuredEntities.has("DominusWebhookParsed")) {
  const start = source.indexOf("async function listRelationalCoreRows");
  const end = source.indexOf("async function writeRelationalFinancialDimension", start);
  const reader = source.slice(start, end);
  if (!reader.includes('entity === "DominusWebhookParsed"') || !reader.includes('"maestro_webhook_parsed_messages"')) {
    errors.push("DominusWebhookParsed: tabela relacional não está mapeada pelo reader");
  }
  if (!reader.includes('entity === "DominusWebhookParsed" || entity === "Comment"') || !reader.includes('? "payload"')) {
    errors.push("DominusWebhookParsed: coluna de payload relacional não está mapeada");
  }
}

console.log(JSON.stringify({
  status: errors.length ? "failed" : "ok",
  configured_entities: configuredEntities.size,
  backend_entities: serverEntities.size,
  subtask_transfer_errors: subtaskTransferErrors,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
