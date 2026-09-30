import fs from "node:fs/promises";
import { verifySubtaskTransferContract } from "./lib/subtask-transfer-contract.mjs";

const envPath = new URL("../.env.production.local", import.meta.url);
const contractPath = new URL("./config/relational-read-entities.json", import.meta.url);
const sourcePath = new URL("../supabase/functions/maestro-data/index.ts", import.meta.url);
const clientPath = new URL("../src/api/supabaseClient.js", import.meta.url);
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const envText = await fs.readFile(envPath, "utf8").catch(() => "");
const contractEntities = JSON.parse(await fs.readFile(contractPath, "utf8"));
const source = await fs.readFile(sourcePath, "utf8");
const clientSource = await fs.readFile(clientPath, "utf8");
const migrationFiles = (await fs.readdir(migrationDirectory)).filter((name) => name.endsWith(".sql"));
const migrationSources = await Promise.all(migrationFiles.map((name) => fs.readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")));
const migrationSource = migrationSources.join("\n");
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
const tableMapBody = source.match(/const tableByEntity: Record<string, string> = \{([\s\S]*?)\n\s*\};/)?.[1] || "";
const tableMappings = [...tableMapBody.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*"(maestro_[a-z0-9_]+)"/gm)];
const payloadMapBody = source.match(/const payloadColumnByEntity: Record<string, string> = \{([\s\S]*?)\n\s*\};/)?.[1] || "";
const payloadMappings = [...payloadMapBody.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*"([a-z][a-z0-9_]*)"/gm)];
const relationalTableEntities = new Set(tableMappings.map(([, entity]) => entity));
const readerFieldsBody = source.match(/const fieldsByEntity: Record<string, Record<string, string>> = \{([\s\S]*?)\n\s*\};/)?.[1] || "";
const readerFieldMappings = [...readerFieldsBody.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*):\s*\{([^}]*)\}/gm)];
const sqlColumnTypes = "uuid|text|boolean|integer|smallint|bigint|numeric|date|time|timestamptz|timestamp|jsonb|json|real|double precision";
const columnsForTable = (tableName) => {
  const columns = new Set();
  const createTable = migrationSource.match(new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}\\s*\\(([\\s\\S]*?)\\);`, "i"))?.[1] || "";
  for (const [, column] of createTable.matchAll(new RegExp(`^\\s*([a-z][a-z0-9_]*)\\s+(?:${sqlColumnTypes})\\b`, "gmi"))) columns.add(column);
  const alterExpression = new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+public\\.${tableName}\\s+add\\s+column(?:\\s+if\\s+not\\s+exists)?\\s+([a-z][a-z0-9_]*)\\s+`, "gi");
  for (const [, column] of migrationSource.matchAll(alterExpression)) columns.add(column);
  return columns;
};
const columnTypesForTable = (tableName) => {
  const types = new Map();
  const createTable = migrationSource.match(new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}\\s*\\(([\\s\\S]*?)\\);`, "i"))?.[1] || "";
  for (const [, column, type] of createTable.matchAll(new RegExp(`^\\s*([a-z][a-z0-9_]*)\\s+(${sqlColumnTypes})\\b`, "gmi"))) types.set(column, type.toLowerCase());
  const alterExpression = new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+public\\.${tableName}\\s+add\\s+column(?:\\s+if\\s+not\\s+exists)?\\s+([a-z][a-z0-9_]*)\\s+(${sqlColumnTypes})\\b`, "gi");
  for (const [, column, type] of migrationSource.matchAll(alterExpression)) types.set(column, type.toLowerCase());
  return types;
};

if (!configuredEntities.size) errors.push("scripts/config/relational-read-entities.json está vazio");
if (configuredEntities.size !== contractEntities.length) errors.push("scripts/config/relational-read-entities.json contém entidades duplicadas");
if (!clientSource.includes("VITE_MAESTRO_RELATIONAL_READS")
  || !clientSource.includes("read_source: 'relational'")) {
  errors.push("cliente não permite habilitar leitura relacional explicitamente por entidade");
}
if (!source.includes('body.read_source === "relational"')
  || !source.includes('...(requestedRelational ? { read_source: actualReadSource } : {})')
  || !source.includes(".eq(\"organization_id\", organizationId)")
  || !source.includes("if (!column) return null;")
  || !source.includes("if (!rows) rows = await listRows(session.organization_id, entity, readOptions);")) {
  errors.push("reader deve reportar a origem real, limitar tenant e cair para legacy quando não puder mapear o filtro");
}
if (envText.includes("VITE_MAESTRO_RELATIONAL_READS=")
  && JSON.stringify([...envEntities].sort()) !== JSON.stringify([...configuredEntities].sort())) {
  errors.push(".env.production.local diverge de scripts/config/relational-read-entities.json");
}
for (const entity of configuredEntities) {
  if (!serverEntities.has(entity)) errors.push(`${entity}: configurado no frontend, mas sem dispatcher relacional no backend`);
  if (!relationalTableEntities.has(entity)) errors.push(`${entity}: sem tabela relacional no mapa do reader`);
  const tableName = tableMappings.find(([, mappedEntity]) => mappedEntity === entity)?.[2];
  if (tableName && !new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}\\s*\\(`, "i").test(migrationSource)) {
    errors.push(`${entity}: a tabela ${tableName} não é criada por nenhuma migration versionada`);
  }
  const payloadColumn = payloadMappings.find(([, mappedEntity]) => mappedEntity === entity)?.[2];
  if (!payloadColumn) errors.push(`${entity}: sem mapeamento explícito da coluna de payload relacional`);
  else if (tableName) {
    const columnTypes = columnTypesForTable(tableName);
    if (!columnTypes.has(payloadColumn)) errors.push(`${entity}: coluna de payload ${tableName}.${payloadColumn} não existe no schema versionado`);
    else if (!/^(json|jsonb)$/.test(columnTypes.get(payloadColumn))) errors.push(`${entity}: coluna ${tableName}.${payloadColumn} não é JSON/JSONB`);
  }
  const fieldMapping = readerFieldMappings.find(([, mappedEntity]) => mappedEntity === entity);
  if (!fieldMapping) errors.push(`${entity}: sem mapeamento de colunas de filtro/ordenação no reader`);
  else if (tableName) {
    const columns = columnsForTable(tableName);
    for (const [, column] of fieldMapping[2].matchAll(/:\s*"([a-z][a-z0-9_]*)"/g)) {
      if (!columns.has(column)) errors.push(`${entity}: coluna ${tableName}.${column} não existe no schema versionado`);
    }
  }
  if (!source.includes(`|| RELATIONAL_${entity === "DominusWebhookParsed" ? "WEBHOOK" : "UNKNOWN"}_ENTITIES.has(entity)`)
    && entity === "DominusWebhookParsed") {
    errors.push(`${entity}: dispatcher não declara a entidade na resposta read_source`);
  }
}

if (configuredEntities.has("DominusWebhookParsed")) {
  if (!/DominusWebhookParsed:\s*"maestro_webhook_parsed_messages"/.test(tableMapBody)) {
    errors.push("DominusWebhookParsed: tabela relacional não está mapeada pelo reader");
  }
  if (!payloadMappings.some(([, entity]) => entity === "DominusWebhookParsed")) {
    errors.push("DominusWebhookParsed: coluna de payload relacional não está mapeada");
  }
}

console.log(JSON.stringify({
  status: errors.length ? "failed" : "ok",
  configured_entities: configuredEntities.size,
  backend_entities: serverEntities.size,
  migration_tables_checked: [...configuredEntities].filter((entity) => {
    const tableName = tableMappings.find(([, mappedEntity]) => mappedEntity === entity)?.[2];
    return tableName && new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${tableName}\\s*\\(`, "i").test(migrationSource);
  }).length,
  reader_field_maps_checked: [...configuredEntities].filter((entity) => readerFieldMappings.some(([, mappedEntity]) => mappedEntity === entity)).length,
  reader_payload_maps_checked: [...configuredEntities].filter((entity) => payloadMappings.some(([, mappedEntity]) => mappedEntity === entity)).length,
  subtask_transfer_errors: subtaskTransferErrors,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
