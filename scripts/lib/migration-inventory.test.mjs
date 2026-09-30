import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  validateMigrationFilenames,
  validateOptionalSnapshotReferences,
  validateSchedulerEnvironmentTargets,
} from "./migration-inventory.mjs";

test("accepts versioned snake-case SQL migration filenames", () => {
  assert.deepEqual(validateMigrationFilenames([
    "0001_legacy_records.sql",
    "20260927053724_cxm_silence_due_jobs_tenant_scope.sql",
  ]), []);
});

test("rejects malformed names, duplicate versions, and duplicate migration names", () => {
  assert.deepEqual(validateMigrationFilenames([
    "20260927053724_first_change.sql",
    "20260927053724_second_change.sql",
    "20260927060000_first_change.sql",
    "not-a-migration.sql",
  ]), [
    "20260927053724_second_change.sql: versão duplicada 20260927053724",
    "20260927060000_first_change.sql: nome de migration duplicado first_change",
    "not-a-migration.sql: nome inválido; esperado <versão>_<nome_snake_case>.sql",
  ]);
});

test("accepts an optional snapshot reference guarded before dynamic SQL", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "migration-inventory-"));
  const filename = "0004_publish_imported_records.sql";
  await fs.writeFile(path.join(directory, filename), `
    do $$ begin
      if to_regclass('migration.base44_records') is null then return; end if;
      execute $import$ insert into public.legacy_records select * from migration.base44_records $import$;
    end $$;
  `);

  assert.deepEqual(await validateOptionalSnapshotReferences(new URL(`file://${directory}/`), [filename]), []);
  await fs.rm(directory, { recursive: true, force: true });
});

test("rejects an unguarded or statically parsed optional snapshot reference", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "migration-inventory-"));
  const filename = "0004_publish_imported_records.sql";
  await fs.writeFile(path.join(directory, filename), `
    insert into public.legacy_records select * from migration.base44_records;
  `);

  const errors = await validateOptionalSnapshotReferences(new URL(`file://${directory}/`), [filename]);
  assert.equal(errors.length, 3);
  assert.match(errors.join("\n"), /verifique a existência/);
  assert.match(errors.join("\n"), /somente em SQL dinâmico/);
  assert.match(errors.join("\n"), /deve usar SQL dinâmico/);
  await fs.rm(directory, { recursive: true, force: true });
});

test("accepts scheduler URLs resolved from environment secrets", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "migration-scheduler-"));
  const filename = "20260927000000_reconcile_environment_cron_jobs.sql";
  await fs.writeFile(path.join(directory, filename), `
    select decrypted_secret into project_url from vault.decrypted_secrets where name = 'meta_ads_sync_project_url';
    select net.http_post(url := rtrim(project_url, '/') || '/functions/v1/meta-ads-sync-cron');
  `);

  assert.deepEqual(await validateSchedulerEnvironmentTargets(new URL(`file://${directory}/`), [filename]), []);
  await fs.rm(directory, { recursive: true, force: true });
});

test("rejects hardcoded Supabase Edge Function URLs in scheduler migrations", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "migration-scheduler-"));
  const filename = "20260927000000_reconcile_environment_cron_jobs.sql";
  await fs.writeFile(path.join(directory, filename), `
    select net.http_post(url := 'https://production-ref.supabase.co/functions/v1/meta-ads-sync-cron');
  `);

  const errors = await validateSchedulerEnvironmentTargets(new URL(`file://${directory}/`), [filename]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /leia a URL do ambiente no Vault/);
  await fs.rm(directory, { recursive: true, force: true });
});
