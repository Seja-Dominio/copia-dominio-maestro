import test from "node:test";
import assert from "node:assert/strict";
import { resolveMaestroFunctionFallback, resolveMaestroProvider } from "../../src/api/maestro-provider.mjs";

test("defaults an unset provider to Supabase", () => {
  assert.equal(resolveMaestroProvider(undefined), "supabase");
  assert.equal(resolveMaestroProvider(""), "supabase");
});

test("accepts only explicitly supported providers", () => {
  assert.equal(resolveMaestroProvider("supabase"), "supabase");
  assert.equal(resolveMaestroProvider("base44"), "base44");
  assert.throws(() => resolveMaestroProvider("unknown"), /inválido/);
});

test("does not silently fall back to Base44 for an unmapped Supabase function", () => {
  assert.equal(resolveMaestroFunctionFallback("supabase"), "unsupported");
  assert.equal(resolveMaestroFunctionFallback("base44"), "base44");
});
