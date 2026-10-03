import test from "node:test";
import assert from "node:assert/strict";
import { resolveCoreDataCorsOrigin } from "../../supabase/functions/maestro-core-data/cors-policy.mjs";

test("core data CORS allows the app's local Vite and preview origins", () => {
  for (const origin of [
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:4174",
    "http://127.0.0.1:4174",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]) assert.equal(resolveCoreDataCorsOrigin(origin), origin);
});

test("core data CORS does not echo unknown origins", () => {
  assert.equal(resolveCoreDataCorsOrigin("https://attacker.invalid"), "https://dominiomaestro.com.br");
  assert.equal(resolveCoreDataCorsOrigin(""), "https://dominiomaestro.com.br");
});
