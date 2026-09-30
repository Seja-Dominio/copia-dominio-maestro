import fs from "node:fs/promises";
import {
  validateMigrationFilenames,
  validateOptionalSnapshotReferences,
  validateSchedulerEnvironmentTargets,
} from "./lib/migration-inventory.mjs";

const directory = new URL("../supabase/migrations/", import.meta.url);
const filenames = (await fs.readdir(directory)).filter((filename) => filename.endsWith(".sql"));
const errors = [
  ...validateMigrationFilenames(filenames),
  ...await validateOptionalSnapshotReferences(directory, filenames),
  ...await validateSchedulerEnvironmentTargets(directory, filenames),
];

console.log(JSON.stringify({
  status: errors.length ? "failed" : "ok",
  migration_files: filenames.length,
  errors,
}, null, 2));

if (!filenames.length || errors.length) process.exitCode = 1;
