import fs from "node:fs/promises";
import pg from "pg";
import { getIsolatedTestDatabaseSsl, getIsolatedTestDatabaseUrl } from "./lib/isolated-test-database.mjs";

let databaseUrl;
try {
  databaseUrl = getIsolatedTestDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: getIsolatedTestDatabaseSsl(databaseUrl) });
const failures = [];
const products = ["maestro", "cxm", "ads_brain", "insights"];
const expectedRlsTables = ["maestro_clients", "maestro_projects", "maestro_jobs", "maestro_financial_entries"];

const frontend = await fs.readFile(new URL("../src/lib/accessControl.js", import.meta.url), "utf8");
const maestroData = await fs.readFile(new URL("../supabase/functions/maestro-data/index.ts", import.meta.url), "utf8");
const maestroAi = await fs.readFile(new URL("../supabase/functions/maestro-ai/index.ts", import.meta.url), "utf8");
const trafficCopilot = await fs.readFile(new URL("../supabase/functions/traffic-copilot/index.ts", import.meta.url), "utf8");

const requiredMappings = [
  ["CXM", '"cxm"'],
  ["AdsBrain", '"ads_brain"'],
  ["Instagram", '"insights"'],
  ["Reports", '"insights"'],
];
for (const [name, marker] of requiredMappings) {
  if (!frontend.includes(marker)) failures.push(`frontend:${name}:missing_product_mapping`);
}
for (const marker of ['"cxm"', '"ads_brain"', '"insights"']) {
  if (!maestroData.includes(marker)) failures.push(`maestro-data:${marker}:missing_product_guard`);
}
for (const marker of ['hasProduct("cxm")', 'hasProduct("ads_brain")', 'hasProduct("insights")']) {
  if (!maestroAi.includes(marker)) failures.push(`maestro-ai:${marker}:missing_product_guard`);
}
if (!trafficCopilot.includes("hasAdsBrainAccess")) failures.push("traffic-copilot:missing_ads_brain_guard");

try {
  await client.connect();
  await client.query("begin read only");
  const session = await client.query("select current_setting('transaction_read_only') as read_only");
  if (session.rows[0]?.read_only !== "on") throw new Error("Product-module verifier must run in a read-only transaction.");
  const tableResult = await client.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled,
      exists (select 1 from information_schema.columns col
        where col.table_schema='public' and col.table_name=c.relname
          and col.column_name='organization_id' and col.is_nullable='NO') as organization_not_null
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname = any($1::text[])
  `, [expectedRlsTables]);
  const tableMap = new Map(tableResult.rows.map((row) => [row.table_name, row]));
  for (const table of expectedRlsTables) {
    const row = tableMap.get(table);
    if (!row) failures.push(`database:${table}:missing`);
    else {
      if (!row.rls_enabled) failures.push(`database:${table}:rls_disabled`);
      if (!row.organization_not_null) failures.push(`database:${table}:organization_id_not_null_missing`);
    }
  }

  const productRows = await client.query(`
    select o.slug as organization_slug, p.product_key, p.status
    from public.organization_products p
    join public.organizations o on o.id = p.organization_id
    where p.product_key = any($1::text[])
    order by o.slug, p.product_key
  `, [products]);
  for (const row of productRows.rows) {
    if (!products.includes(row.product_key)) failures.push(`database:organization_products:${row.product_key}:invalid_product`);
    if (!["trial", "enabled", "suspended", "cancelled"].includes(row.status)) failures.push(`database:organization_products:${row.product_key}:invalid_status`);
  }

  const policyRows = await client.query(`
    select tablename, policyname, roles::text, cmd
    from pg_policies
    where schemaname='public' and tablename = any($1::text[])
      and roles::text like '%authenticated%'
    order by tablename, policyname
  `, [expectedRlsTables]);
  for (const table of expectedRlsTables) {
    const rows = policyRows.rows.filter((row) => row.tablename === table);
    if (!rows.length) failures.push(`database:${table}:authenticated_policy_missing`);
  }

  console.log(JSON.stringify({
    status: failures.length ? "failed" : "ok",
    products,
    assignments: productRows.rows,
    rls_tables: tableResult.rows,
    authenticated_policies: policyRows.rows,
    failures,
  }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
