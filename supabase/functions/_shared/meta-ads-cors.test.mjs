import assert from "node:assert/strict";
import test from "node:test";
import { buildAdsBrainCorsHeaders } from "./meta-ads-cors.js";

test("Ads Brain allows only the production origin and configured local Dev previews", () => {
  const allowedOrigins = [
    "https://dominiomaestro.com.br",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:4174",
    "http://127.0.0.1:4174",
    "http://localhost:4175",
    "http://127.0.0.1:4175",
  ];

  for (const origin of allowedOrigins) {
    const headers = buildAdsBrainCorsHeaders(origin);
    assert.equal(headers["Access-Control-Allow-Origin"], origin);
    assert.equal(headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
    assert.match(headers["Access-Control-Allow-Headers"], /authorization/);
    assert.equal(headers.Vary, "Origin");
  }
});

test("Ads Brain does not reflect arbitrary origins", () => {
  const headers = buildAdsBrainCorsHeaders("https://attacker.example");
  assert.equal(headers["Access-Control-Allow-Origin"], "https://dominiomaestro.com.br");
  assert.notEqual(headers["Access-Control-Allow-Origin"], "https://attacker.example");
});
