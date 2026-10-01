import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { fingerprintSqlStatements } from "./lib/sql-token-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(root, "supabase/migrations");
const includeDetails = process.argv.includes("--details");
const targets = [
  { envKey: "SUPABASE_DEV_DB_URL", projectRef: "tqmfuskvllpqmvayjuqu" },
  { envKey: "SUPABASE_PROD_DB_URL", projectRef: "fwpisypiiezjhtqxlmqv" },
];

function connectionRef(connectionString) {
  const url = new URL(connectionString);
  return url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1]
    || decodeURIComponent(url.username).split(".").at(-1);
}

function identity(row) {
  return `${row.version}/${row.name}`;
}

function summarize(local, remote) {
  const remoteByIdentity = new Map(remote.map((row) => [identity(row), row]));
  const remoteByFingerprint = new Map();
  for (const row of remote) {
    if (!remoteByFingerprint.has(row.fingerprint)) remoteByFingerprint.set(row.fingerprint, []);
    remoteByFingerprint.get(row.fingerprint).push(row);
  }

  const localByFingerprint = new Map();
  for (const row of local) {
    if (!localByFingerprint.has(row.fingerprint)) localByFingerprint.set(row.fingerprint, []);
    localByFingerprint.get(row.fingerprint).push(row);
  }

  const counts = {
    identity_and_content_match: 0,
    identity_content_differs: 0,
    same_name_other_version_content_match: 0,
    same_name_other_version_content_differs: 0,
    same_content_different_name: 0,
    local_content_not_in_ledger: 0,
    remote_content_not_in_checkout: 0,
  };
  const identityMismatches = [];
  const aliases = [];
  const unrepresentedLocal = [];
  const remoteWithoutLocalContent = [];

  for (const localRow of local) {
    const remoteRow = remoteByIdentity.get(identity(localRow));
    if (remoteRow) {
      if (remoteRow.fingerprint === localRow.fingerprint) counts.identity_and_content_match += 1;
      else {
        counts.identity_content_differs += 1;
        identityMismatches.push(identity(localRow));
      }
      continue;
    }
    const sameContent = remoteByFingerprint.get(localRow.fingerprint) || [];
    if (sameContent.length) {
      if (sameContent.some((row) => row.name === localRow.name)) counts.same_name_other_version_content_match += 1;
      else counts.same_content_different_name += 1;
      aliases.push({ local: identity(localRow), remote: sameContent.map(identity) });
    } else {
      counts.local_content_not_in_ledger += 1;
      unrepresentedLocal.push(identity(localRow));
      if (remote.some((row) => row.name === localRow.name)) counts.same_name_other_version_content_differs += 1;
    }
  }

  for (const remoteRow of remote) {
    if (!localByFingerprint.has(remoteRow.fingerprint)) {
      remoteWithoutLocalContent.push(identity(remoteRow));
      counts.remote_content_not_in_checkout += 1;
    }
  }

  return {
    local_migrations: local.length,
    remote_ledger_entries: remote.length,
    counts,
    identity_content_mismatches: identityMismatches,
    exact_content_aliases: aliases,
    local_content_not_in_ledger: unrepresentedLocal,
    remote_content_not_in_checkout: remoteWithoutLocalContent,
  };
}

const filenames = (await fs.readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
const local = await Promise.all(filenames.map(async (filename) => {
  const match = filename.match(/^(\d{4,14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/);
  if (!match) throw new Error(`Invalid migration filename: ${filename}`);
  const sql = await fs.readFile(path.join(migrationsDirectory, filename), "utf8");
  return { version: match[1], name: match[2], fingerprint: fingerprintSqlStatements([sql]) };
}));

const reports = [];
for (const target of targets) {
  const connectionString = process.env[target.envKey];
  if (!connectionString) throw new Error(`Missing ${target.envKey}`);
  if (connectionRef(connectionString) !== target.projectRef) throw new Error(`${target.envKey} does not match its expected project ref`);

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
  let transactionOpen = false;
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;
    const mode = await client.query("select current_setting('transaction_read_only') as mode");
    if (mode.rows[0]?.mode !== "on") throw new Error("Read-only transaction could not be confirmed");

    const result = await client.query("select version, name, statements from supabase_migrations.schema_migrations order by version");
    const remote = result.rows.map((row) => ({
      version: String(row.version),
      name: row.name || "",
      fingerprint: fingerprintSqlStatements(row.statements || []),
    }));
    const report = summarize(local, remote);
    reports.push({
      environment: target.envKey,
      project_ref: target.projectRef,
      local_migrations: report.local_migrations,
      remote_ledger_entries: report.remote_ledger_entries,
      counts: report.counts,
      ...(includeDetails ? {
        identity_content_mismatches: report.identity_content_mismatches,
        exact_content_aliases: report.exact_content_aliases,
        local_content_not_in_ledger: report.local_content_not_in_ledger,
        remote_content_not_in_checkout: report.remote_content_not_in_checkout,
      } : {}),
    });
  } catch (error) {
    console.error(JSON.stringify({ environment: target.envKey, failure: error.code || error.name || "unknown" }));
    process.exitCode = 1;
  } finally {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}

if (reports.length) console.log(JSON.stringify({ read_only: true, reports }, null, 2));
