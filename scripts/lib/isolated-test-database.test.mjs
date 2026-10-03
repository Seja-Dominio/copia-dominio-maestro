import test from "node:test";
import assert from "node:assert/strict";
import { getIsolatedTestDatabaseSsl, getIsolatedTestDatabaseUrl } from "./isolated-test-database.mjs";

const branchRef = "icwmnobokxuqrtovayri";

test("accepts a direct connection matching the isolated branch ref", () => {
  const url = `postgresql://postgres:gitleaks-test-placeholder@db.${branchRef}.supabase.co:5432/postgres`;
  assert.equal(getIsolatedTestDatabaseUrl({
    SUPABASE_TEST_DB_URL: url,
    SUPABASE_TEST_PROJECT_REF: branchRef,
  }), url);
});

test("accepts a pooler connection whose username matches the isolated branch ref", () => {
  const url = `postgresql://postgres.${branchRef}:gitleaks-test-placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
  assert.equal(getIsolatedTestDatabaseUrl({
    SUPABASE_TEST_DB_URL: url,
    SUPABASE_TEST_PROJECT_REF: branchRef,
  }), url);
});

test("rejects missing explicit test settings", () => {
  assert.throws(() => getIsolatedTestDatabaseUrl({}), /SUPABASE_TEST_DB_URL/);
});

test("rejects refs protected as Production or currently ambiguous", () => {
  for (const ref of ["fwpisypiiezjhtqxlmqv", "tqmfuskvllpqmvayjuqu"]) {
    assert.throws(() => getIsolatedTestDatabaseUrl({
      SUPABASE_TEST_DB_URL: `postgresql://postgres.${ref}:gitleaks-test-placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
      SUPABASE_TEST_PROJECT_REF: ref,
    }), /bloqueia/i);
  }
});

test("rejects a connection whose embedded project ref differs", () => {
  assert.throws(() => getIsolatedTestDatabaseUrl({
    SUPABASE_TEST_DB_URL: "postgresql://postgres.tqmfuskvllpqmvayjuqu:gitleaks-test-placeholder@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
    SUPABASE_TEST_PROJECT_REF: branchRef,
  }), /não corresponde/);
});

test("uses TLS for remote isolated branches and disables it only for loopback local Postgres", () => {
  assert.deepEqual(getIsolatedTestDatabaseSsl(`postgresql://postgres.${branchRef}:secret@db.${branchRef}.supabase.co:5432/postgres`), { rejectUnauthorized: false });
  assert.equal(getIsolatedTestDatabaseSsl("postgresql://postgres:postgres@127.0.0.1:57422/postgres"), false);
});
