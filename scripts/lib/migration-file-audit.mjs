import fs from "node:fs/promises";
import path from "node:path";
import { fingerprintSqlStatements } from "./sql-token-fingerprint.mjs";

const MIGRATION_FILENAME = /^(\d{4,14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

async function readMigrationDirectory(directory) {
  const filenames = (await fs.readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const seenVersions = new Set();
  return Promise.all(filenames.map(async (filename) => {
    const match = filename.match(MIGRATION_FILENAME);
    if (!match) throw new Error(`Invalid migration filename: ${filename}`);
    const [, version, name] = match;
    if (seenVersions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    seenVersions.add(version);
    const sql = await fs.readFile(path.join(directory, filename), "utf8");
    return { version, name, fingerprint: fingerprintSqlStatements([sql]) };
  }));
}

function identity(row) {
  return `${row.version}/${row.name}`;
}

function addToIndex(index, key, row) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(row);
}

export async function auditMigrationDirectories(localDirectory, remoteDirectory) {
  const [local, remote] = await Promise.all([
    readMigrationDirectory(localDirectory),
    readMigrationDirectory(remoteDirectory),
  ]);
  const remoteByIdentity = new Map(remote.map((row) => [identity(row), row]));
  const remoteByFingerprint = new Map();
  const localByFingerprint = new Map();
  for (const row of remote) addToIndex(remoteByFingerprint, row.fingerprint, row);
  for (const row of local) addToIndex(localByFingerprint, row.fingerprint, row);

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
  const localContentNotInLedger = [];
  const remoteContentNotInCheckout = [];

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

    const matches = remoteByFingerprint.get(localRow.fingerprint) || [];
    if (matches.length) {
      if (matches.some((row) => row.name === localRow.name)) counts.same_name_other_version_content_match += 1;
      else counts.same_content_different_name += 1;
      aliases.push({ local: identity(localRow), remote: matches.map(identity) });
    } else {
      counts.local_content_not_in_ledger += 1;
      localContentNotInLedger.push(identity(localRow));
      if (remote.some((row) => row.name === localRow.name)) counts.same_name_other_version_content_differs += 1;
    }
  }

  for (const remoteRow of remote) {
    if (!localByFingerprint.has(remoteRow.fingerprint)) {
      counts.remote_content_not_in_checkout += 1;
      remoteContentNotInCheckout.push(identity(remoteRow));
    }
  }

  return {
    local_migrations: local.length,
    remote_ledger_entries: remote.length,
    counts,
    identity_content_mismatches: identityMismatches,
    exact_content_aliases: aliases,
    local_content_not_in_ledger: localContentNotInLedger,
    remote_content_not_in_checkout: remoteContentNotInCheckout,
  };
}
