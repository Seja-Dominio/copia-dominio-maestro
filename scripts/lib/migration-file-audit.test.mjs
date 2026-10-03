import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditMigrationDirectories } from "./migration-file-audit.mjs";

async function writeMigrations(directory, entries) {
  await fs.mkdir(directory, { recursive: true });
  await Promise.all(entries.map(([filename, sql]) => fs.writeFile(path.join(directory, filename), sql)));
}

test("audits migration identity separately from exact SQL token fingerprints", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-file-audit-"));
  const local = path.join(root, "local");
  const remote = path.join(root, "remote");
  try {
    await writeMigrations(local, [
      ["1000_alpha.sql", "-- local comment\nCREATE TABLE public.alpha (id integer);"],
      ["2000_beta.sql", "SELECT 1;"],
      ["3000_conflict.sql", "CREATE TABLE public.old_shape (id integer);"],
      ["4000_local_only.sql", "SELECT 4;"],
    ]);
    await writeMigrations(remote, [
      ["1000_alpha.sql", "/* remote comment */ CREATE  TABLE public.alpha(id integer) ;"],
      ["5000_beta.sql", "select 1;"],
      ["3000_conflict.sql", "CREATE TABLE public.new_shape (id integer);"],
      ["6000_remote_only.sql", "SELECT 6;"],
    ]);

    const report = await auditMigrationDirectories(local, remote);
    assert.equal(report.local_migrations, 4);
    assert.equal(report.remote_ledger_entries, 4);
    assert.deepEqual(report.counts, {
      identity_and_content_match: 1,
      identity_content_differs: 1,
      same_name_other_version_content_match: 1,
      same_name_other_version_content_differs: 0,
      same_content_different_name: 0,
      local_content_not_in_ledger: 1,
      remote_content_not_in_checkout: 2,
    });
    assert.deepEqual(report.identity_content_mismatches, ["3000/conflict"]);
    assert.deepEqual(report.exact_content_aliases, [{ local: "2000/beta", remote: ["5000/beta"] }]);
    assert.deepEqual(report.local_content_not_in_ledger, ["4000/local_only"]);
    assert.deepEqual(report.remote_content_not_in_checkout, ["3000/conflict", "6000/remote_only"]);
    assert.equal(JSON.stringify(report).includes("CREATE TABLE"), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects duplicate versions before reporting misleading matches", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-file-audit-"));
  const local = path.join(root, "local");
  const remote = path.join(root, "remote");
  try {
    await writeMigrations(local, [["1000_alpha.sql", "SELECT 1;"]]);
    await writeMigrations(remote, [
      ["1000_alpha.sql", "SELECT 1;"],
      ["1000_beta.sql", "SELECT 2;"],
    ]);
    await assert.rejects(auditMigrationDirectories(local, remote), /Duplicate migration version: 1000/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
