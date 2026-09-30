import fs from "node:fs/promises";

const MIGRATION_FILENAME = /^(\d{4,14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

const OPTIONAL_SNAPSHOT = {
  relation: "migration.base44_records",
  migration: "0004_publish_imported_records.sql",
  guard: "to_regclass('migration.base44_records')",
};

export function validateMigrationFilenames(filenames) {
  const errors = [];
  const versions = new Set();
  const names = new Set();

  for (const filename of filenames) {
    const match = filename.match(MIGRATION_FILENAME);
    if (!match) {
      errors.push(`${filename}: nome inválido; esperado <versão>_<nome_snake_case>.sql`);
      continue;
    }

    const [, version, name] = match;
    if (versions.has(version)) errors.push(`${filename}: versão duplicada ${version}`);
    if (names.has(name)) errors.push(`${filename}: nome de migration duplicado ${name}`);
    versions.add(version);
    names.add(name);
  }

  return errors;
}

export async function validateOptionalSnapshotReferences(directory, filenames) {
  const errors = [];

  for (const filename of filenames) {
    const sql = await fs.readFile(new URL(filename, directory), "utf8");
    const referencesSnapshot = sql.includes(OPTIONAL_SNAPSHOT.relation);
    if (!referencesSnapshot) continue;

    if (filename !== OPTIONAL_SNAPSHOT.migration) {
      errors.push(`${filename}: referência não catalogada à relação opcional ${OPTIONAL_SNAPSHOT.relation}`);
      continue;
    }

    const guardIndex = sql.indexOf(OPTIONAL_SNAPSHOT.guard);
    const dynamicImportIndex = sql.indexOf("execute $import$");
    const executableSql = sql.replace(/execute\s+\$import\$[\s\S]*?\$import\$/gi, "");
    const staticReferenceIndex = executableSql.search(/\b(?:from|join)\s+migration\.base44_records\b/i);

    if (guardIndex < 0) errors.push(`${filename}: verifique a existência de ${OPTIONAL_SNAPSHOT.relation} antes da importação`);
    if (staticReferenceIndex >= 0) errors.push(`${filename}: a relação opcional deve ser referenciada somente em SQL dinâmico`);
    if (dynamicImportIndex < 0) {
      errors.push(`${filename}: importação do snapshot opcional deve usar SQL dinâmico após a guarda`);
    } else if (guardIndex >= 0 && guardIndex > dynamicImportIndex) {
      errors.push(`${filename}: a guarda do snapshot deve ocorrer antes da importação dinâmica`);
    }
  }

  return errors;
}

export async function validateSchedulerEnvironmentTargets(directory, filenames) {
  const errors = [];
  const schedulerFilename = /(?:scheduler|cron)/i;
  const hardcodedSupabaseFunctionUrl = /https?:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\//i;

  for (const filename of filenames) {
    if (!schedulerFilename.test(filename)) continue;
    const sql = await fs.readFile(new URL(filename, directory), "utf8");
    if (hardcodedSupabaseFunctionUrl.test(sql)) {
      errors.push(`${filename}: scheduler não pode embutir URL de Edge Function; leia a URL do ambiente no Vault`);
    }
  }

  return errors;
}
