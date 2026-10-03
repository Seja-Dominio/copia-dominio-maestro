import test from "node:test";
import assert from "node:assert/strict";
import { resolveMaestroProvider } from "../../src/api/maestro-provider.mjs";

test("defaults an unset provider to Supabase", () => {
  assert.equal(resolveMaestroProvider(undefined), "supabase");
  assert.equal(resolveMaestroProvider(""), "supabase");
});

test("accepts only explicitly supported providers", () => {
  assert.equal(resolveMaestroProvider("supabase"), "supabase");
  assert.throws(() => resolveMaestroProvider("base44"), /somente supabase/);
  assert.throws(() => resolveMaestroProvider("unknown"), /inválido/);
});
