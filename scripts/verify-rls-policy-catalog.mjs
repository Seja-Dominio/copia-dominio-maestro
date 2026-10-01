import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { getIsolatedTestDatabaseSsl, getIsolatedTestDatabaseUrl } from "./lib/isolated-test-database.mjs";
import { extractPolicyTargets } from "./lib/policy-target-ownership.mjs";
import { validateRlsPolicyCatalog } from "./lib/rls-policy-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(root, "supabase/migrations/20260926520000_add_authenticated_organization_rls.sql");
const targets = extractPolicyTargets(await fs.readFile(migrationPath, "utf8"));
let connectionString;
try {
  connectionString = getIsolatedTestDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const client = new pg.Client({ connectionString, ssl: getIsolatedTestDatabaseSsl(connectionString) });
let transactionOpen = false;
try {
  await client.connect();
  await client.query("begin read only");
  transactionOpen = true;
  const mode = await client.query("select current_setting('transaction_read_only') as read_only");
  if (mode.rows[0]?.read_only !== "on") throw new Error("Policy catalog verification requires a read-only transaction");
  const result = await client.query(`
    select expected.table_name, c.relrowsecurity as rls_enabled,
      p.policyname as policy_name, p.cmd as command, p.permissive,
      p.roles::text[] as roles, p.qual as using_expression, p.with_check as check_expression,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
      has_table_privilege('anon', c.oid, 'INSERT') as anon_insert,
      has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
      has_table_privilege('anon', c.oid, 'DELETE') as anon_delete,
      has_table_privilege('anon', c.oid, 'TRUNCATE') as anon_truncate,
      has_table_privilege('anon', c.oid, 'REFERENCES') as anon_references,
      has_table_privilege('anon', c.oid, 'TRIGGER') as anon_trigger,
      has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
      has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
      has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
      has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete,
      has_table_privilege('authenticated', c.oid, 'TRUNCATE') as authenticated_truncate,
      has_table_privilege('authenticated', c.oid, 'REFERENCES') as authenticated_references,
      has_table_privilege('authenticated', c.oid, 'TRIGGER') as authenticated_trigger
    from unnest($1::text[]) expected(table_name)
    left join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = expected.table_name
    left join pg_policies p on p.schemaname = 'public' and p.tablename = expected.table_name
    order by expected.table_name, p.policyname
  `, [targets]);
  const failures = validateRlsPolicyCatalog(targets, result.rows);
  if (failures.length) {
    console.error(JSON.stringify({ status: "failed", target_count: targets.length, failures }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ status: "ok", target_count: targets.length, policy_count: result.rows.filter((row) => row.policy_name).length, direct_client_privileges: 0 }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ status: "failed", error: error.message }));
  process.exitCode = 1;
} finally {
  if (transactionOpen) await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
