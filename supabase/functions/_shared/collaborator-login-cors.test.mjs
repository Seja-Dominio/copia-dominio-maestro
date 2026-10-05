import assert from "node:assert/strict";
import test from "node:test";
import { buildCollaboratorLoginCorsHeaders } from "./collaborator-login-cors.mjs";

test("collaborator login allows the production origin and configured local Dev previews", () => {
  const origins = [
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:4174",
    "http://localhost:4174",
    "http://127.0.0.1:4175",
    "http://localhost:4175",
    "http://127.0.0.1:4176",
    "http://localhost:4176",
    "http://127.0.0.1:4187",
    "http://localhost:4187",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://dominiomaestro.com.br",
  ];

  for (const origin of origins) {
    const headers = buildCollaboratorLoginCorsHeaders(origin);
    assert.equal(headers["Access-Control-Allow-Origin"], origin);
    assert.equal(headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
    assert.match(headers["Access-Control-Allow-Headers"], /authorization/);
  }
});

test("collaborator login does not reflect arbitrary origins", () => {
  const headers = buildCollaboratorLoginCorsHeaders("https://attacker.example");
  assert.equal(headers["Access-Control-Allow-Origin"], "https://dominiomaestro.com.br");
  assert.notEqual(headers["Access-Control-Allow-Origin"], "https://attacker.example");
});
