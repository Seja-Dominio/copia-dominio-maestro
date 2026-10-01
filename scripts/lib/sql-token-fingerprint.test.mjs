import test from "node:test";
import assert from "node:assert/strict";
import { fingerprintSqlStatements, tokenizeSql } from "./sql-token-fingerprint.mjs";

test("ignores comments, whitespace, and statement terminators", () => {
  assert.equal(
    fingerprintSqlStatements(["-- header\nCREATE TABLE public.items (id uuid);", "/* tail */"]),
    fingerprintSqlStatements(["create\n table public.items(/* nested /* note */ */ id uuid)   "]),
  );
});

test("preserves SQL string literals, quoted identifiers, and dollar-quoted bodies", () => {
  assert.notEqual(fingerprintSqlStatements(["select 'one'"]), fingerprintSqlStatements(["select 'two'"]));
  assert.notEqual(fingerprintSqlStatements(['select "MixedCase"']), fingerprintSqlStatements(['select "mixedcase"']));
  assert.notEqual(fingerprintSqlStatements(["do $body$ begin perform 1; end $body$"]), fingerprintSqlStatements(["do $body$ begin perform 2; end $body$"]));
});

test("normalizes unquoted identifiers and keywords case-insensitively", () => {
  assert.equal(fingerprintSqlStatements(["SELECT Public.Items FROM public.items"]), fingerprintSqlStatements(["select public.items from PUBLIC.ITEMS"]));
});

test("rejects unterminated comments and quoted values", () => {
  assert.throws(() => tokenizeSql("select /* unfinished"), /Unterminated SQL block comment/);
  assert.throws(() => tokenizeSql("select 'unfinished"), /Unterminated SQL quoted value/);
});
