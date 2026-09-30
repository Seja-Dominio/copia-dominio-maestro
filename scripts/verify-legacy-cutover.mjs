import fs from "node:fs/promises";
import pg from "pg";
import { getIsolatedTestDatabaseSsl, getIsolatedTestDatabaseUrl } from "./lib/isolated-test-database.mjs";
import { buildRelationalParityCoverageSql } from "./lib/relational-parity-coverage.mjs";
import { assessLegacyRemovalReadiness } from "./lib/legacy-cutover-readiness.mjs";
import { findLegacyCutoverStatusGaps } from "./lib/functional-inventory.mjs";

let databaseUrl;
try {
  databaseUrl = getIsolatedTestDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: getIsolatedTestDatabaseSsl(databaseUrl) });
const failures = [];
const envProduction = await fs.readFile(new URL("../.env.production.local", import.meta.url), "utf8").catch(() => "");
const relationalReads = new Set((envProduction.match(/^VITE_MAESTRO_RELATIONAL_READS=(.*)$/m)?.[1] || "").split(",").map((value) => value.trim()).filter(Boolean));
const nonRegistryCutover = JSON.parse(await fs.readFile(
  new URL("../scripts/config/non-registry-cutover-status.json", import.meta.url), "utf8",
));
const nonRegistryDispositions = JSON.parse(await fs.readFile(
  new URL("../scripts/config/frontend-entity-dispositions.json", import.meta.url), "utf8",
));
const cutoverStatusGaps = findLegacyCutoverStatusGaps({
  entities: nonRegistryDispositions.map(({ entity }) => entity),
  statuses: nonRegistryCutover,
});
if (cutoverStatusGaps.missing.length || cutoverStatusGaps.stale.length || cutoverStatusGaps.invalid.length) {
  failures.push("non_registry_cutover_status:manifest_coverage_invalid");
}

function safeIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Identificador relacional inválido: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

try {
  await client.connect();
  await client.query("begin read only");
  const session = await client.query("select current_setting('transaction_read_only') as read_only");
  if (session.rows[0]?.read_only !== "on") throw new Error("Cutover verifier must run in a read-only transaction.");
  const { rows: registry } = await client.query(`
    select entity, module_key, relational_table, read_mode, write_mode,
      legacy_read_allowed, legacy_write_allowed, status
    from public.legacy_cutover_registry
    order by entity
  `);
  if (!registry.length) failures.push("legacy_cutover_registry:empty");

  const checks = [];
  for (const row of registry) {
    const table = safeIdentifier(row.relational_table);
    const result = await client.query(`
      select
        (select count(*)::int from public.legacy_records
          where entity = $1 and ($1 <> 'Comment' or coalesce(payload->>'entity_type', 'job') = 'job')) as legacy_count,
        (select count(*)::int from public.${table}) as relational_count
    `, [row.entity]);
    const counts = result.rows[0];
    const candidateRead = row.status === "candidate" || row.status === "frozen" || row.status === "retired";
    const frontendRelational = relationalReads.has(row.entity);
    const countMatch = Number(counts.legacy_count) === Number(counts.relational_count);
    if (!countMatch) failures.push(`${row.entity}:count_mismatch:${counts.legacy_count}/${counts.relational_count}`);
    if (candidateRead && row.read_mode === "relational" && !frontendRelational) failures.push(`${row.entity}:frontend_relational_read_missing`);
    if (row.status === "frozen" && row.legacy_write_allowed) failures.push(`${row.entity}:frozen_but_legacy_write_allowed`);
    if (row.status === "retired" && (row.legacy_read_allowed || row.legacy_write_allowed)) failures.push(`${row.entity}:retired_but_legacy_allowed`);
    checks.push({
      entity: row.entity,
      module_key: row.module_key,
      status: row.status,
      read_mode: row.read_mode,
      write_mode: row.write_mode,
      legacy_read_allowed: row.legacy_read_allowed,
      legacy_write_allowed: row.legacy_write_allowed,
      frontend_relational_read: frontendRelational,
      legacy_count: Number(counts.legacy_count),
      relational_count: Number(counts.relational_count),
      count_match: countMatch,
    });
  }

  const coverage = await client.query(buildRelationalParityCoverageSql(registry.map((row) => ({
    entity: row.entity,
    table: row.relational_table,
    relationalId: row.entity === "AIQueryLog" ? "id" : "legacy_record_id",
  }))));
  const coverageByEntity = new Map(coverage.rows.map((row) => [row.entity, row]));
  for (const row of coverage.rows) {
    if (Number(row.missing_relational) !== 0 || Number(row.missing_legacy) !== 0) {
      failures.push(`${row.entity}:id_coverage:${row.missing_relational}/${row.missing_legacy}`);
    }
  }
  for (const check of checks) check.id_coverage = coverageByEntity.get(check.entity) || null;

  const { rows: health } = await client.query(`
    select entity, legacy_count, relational_count, payload_mismatches
    from public.maestro_dual_write_health
    where payload_mismatches <> 0 or legacy_count <> relational_count
  `);
  if (health.length) failures.push(`maestro_dual_write_health:${health.length}_divergences`);

  const { rows: cutoverHealth } = await client.query(`
    select entity, health_status
    from public.maestro_legacy_cutover_health
    where health_status <> 'ok'
  `);
  for (const row of cutoverHealth) failures.push(`maestro_legacy_cutover_health:${row.entity}:${row.health_status}`);

  const { rows: pendingWork } = await client.query(`
    select 'integrity_exception' as queue, entity, issue_type as reason, count(*)::int as records
    from public.relational_integrity_exceptions
    where resolution_status='pending'
    group by entity, issue_type
    union all
    select 'task_reconciliation' as queue, 'Subtask' as entity,
      source_status as reason, count(*)::int as records
    from public.job_task_reconciliation
    where resolution_status='pending'
    group by source_status
    order by queue, entity, reason
  `);

  const removalReadiness = assessLegacyRemovalReadiness(registry, pendingWork, failures, nonRegistryCutover);

  console.log(JSON.stringify({
    status: failures.length ? "failed" : "ok",
    safe_to_remove_legacy: removalReadiness.safeToRemoveLegacy,
    legacy_removal_blockers: {
      entities_not_retired_or_legacy_access_still_allowed: removalReadiness.entitiesNotRetired,
      frontend_entities_outside_registry: removalReadiness.nonRegistryEntitiesNotRetired,
      pending_integrity_work: removalReadiness.pendingWork,
    },
    checks,
    id_coverage: coverage.rows,
    health_divergences: health,
    cutover_health_alerts: cutoverHealth,
    non_registry_cutover_status_gaps: cutoverStatusGaps,
    failures,
  }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
