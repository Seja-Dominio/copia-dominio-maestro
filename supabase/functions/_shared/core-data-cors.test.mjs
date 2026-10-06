import test from "node:test";
import assert from "node:assert/strict";
import { resolveCoreDataCorsOrigin } from "../maestro-core-data/cors-policy.mjs";

test("Maestro core data permits configured local development origins", () => {
  const origins = [
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:4174",
    "http://localhost:4174",
    "http://127.0.0.1:4176",
    "http://localhost:4176",
    "http://127.0.0.1:4187",
    "http://localhost:4187",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://dominiomaestro.com.br",
  ];

  for (const origin of origins) assert.equal(resolveCoreDataCorsOrigin(origin), origin);
});

test("Maestro core data does not reflect arbitrary origins", () => {
  assert.equal(resolveCoreDataCorsOrigin("https://attacker.example"), "https://dominiomaestro.com.br");
});
