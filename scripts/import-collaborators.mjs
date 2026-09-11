import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("/private/tmp/jobhistory-pg/node_modules/pg");

const csv = fs.readFileSync("/Users/grimm/Downloads/Collaborator_export.csv", "utf8").replace(/^\ufeff/, "");
const csvRows = csv.split(/\r?\n/).filter(Boolean).map((line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((value) => value.replace(/^"|"$/g, "").replaceAll('""', '"')));
const headers = csvRows.shift() || [];
const rows = csvRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
const envLine = fs.readFileSync(".env.migration.local", "utf8")
  .split(/\n/).find((line) => line.startsWith("SUPABASE_DB_URL="));
const databaseUrl = new URL(envLine.slice("SUPABASE_DB_URL=".length).trim());
databaseUrl.search = "";
// Use the platform's default certificate verification. Disabling it would
// allow a man-in-the-middle attack against the database connection.
const client = new Client({ connectionString: databaseUrl.toString(), ssl: true });

const isoDate = (value) => value ? new Date(value).toISOString() : null;

await client.connect();
try {
  await client.query("begin");
  for (const payload of rows) {
    const id = String(payload.id);
    const createdAt = isoDate(payload.created_date);
    const updatedAt = isoDate(payload.updated_date);
    await client.query(
      `insert into public.legacy_records(entity,record_id,payload,source_created_at,source_updated_at)
       values($1,$2,$3,$4,$5)
       on conflict(entity,record_id) do update set payload=excluded.payload,
         source_created_at=excluded.source_created_at, source_updated_at=excluded.source_updated_at,
         imported_at=now()`,
      ["Collaborator", id, payload, createdAt, updatedAt],
    );

    const profile = { ...payload, id };
    delete profile.password_hash;
    await client.query(
      `insert into public.maestro_collaborators(id,login,password_hash,is_active,profile,source_updated_at)
       values($1,$2,$3,$4,$5,$6)
       on conflict(id) do update set login=excluded.login, password_hash=excluded.password_hash,
         is_active=excluded.is_active, profile=excluded.profile,
         source_updated_at=excluded.source_updated_at, imported_at=now()`,
      [id, String(payload.login || id), String(payload.password_hash || ""),
        payload.is_active !== false && String(payload.is_active) !== "false", profile, updatedAt],
    );
  }
  await client.query("commit");
  const result = await client.query("select count(*)::bigint as count from public.maestro_collaborators");
  console.log(`maestro_collaborators=${result.rows[0].count}`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
