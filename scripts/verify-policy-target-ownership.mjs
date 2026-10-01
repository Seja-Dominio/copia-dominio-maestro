import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { verifyPolicyTargetOwnership } from "./lib/policy-target-ownership.mjs";

const migrationSql = await readFile("supabase/migrations/20260926520000_add_authenticated_organization_rls.sql", "utf8");
const registrySql = await readFile("supabase/migrations/20260926550000_create_legacy_cutover_registry.sql", "utf8");
const supplementalTargets = JSON.parse(await readFile("scripts/config/relational-policy-target-ownership.json", "utf8"));
const result = verifyPolicyTargetOwnership({
  migrationSql,
  registrySql,
  supplementalTargets,
  evidenceExists: (path) => existsSync(path),
});

console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
