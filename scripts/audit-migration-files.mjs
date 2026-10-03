import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditMigrationDirectories } from "./lib/migration-file-audit.mjs";

const args = process.argv.slice(2);
const directories = args.filter((arg) => !arg.startsWith("--"));
const includeDetails = args.includes("--details");

if (directories.length !== 2) {
  console.error("Usage: node scripts/audit-migration-files.mjs <local-migrations-dir> <fetched-remote-migrations-dir> [--details]");
  process.exit(2);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const resolveDirectory = (directory) => path.resolve(root, "..", directory);
try {
  const report = await auditMigrationDirectories(resolveDirectory(directories[0]), resolveDirectory(directories[1]));
  const { identity_content_mismatches, exact_content_aliases, local_content_not_in_ledger, remote_content_not_in_checkout, ...summary } = report;
  console.log(JSON.stringify({
    read_sql_only: true,
    summary,
    ...(includeDetails ? { identity_content_mismatches, exact_content_aliases, local_content_not_in_ledger, remote_content_not_in_checkout } : {}),
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
}
