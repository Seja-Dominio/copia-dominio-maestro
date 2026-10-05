import test from "node:test";
import assert from "node:assert/strict";
import { patchMaestroDataDevCors } from "../patch-maestro-data-dev-cors.mjs";

const remoteSource = [
  'const isCxmDevelopmentProject = Deno.env.get("SUPABASE_URL") === "https://tqmfuskvllpqmvayjuqu.supabase.co";',
  "const allowedOrigins = new Set([",
  '  "http://127.0.0.1:4174",',
  '  "http://localhost:4174",',
  "  ...(isCxmDevelopmentProject ? [",
  '    "http://127.0.0.1:4175",',
  '    "http://localhost:4175",',
  "  ] : []),",
  '  "https://dominiomaestro.com.br",',
  "]);",
  "function corsHeaders(origin = \"\") { return allowedOrigins.has(origin); }",
].join("\n");

test("adds only the two Maestro preview origins inside the Dev-only allowlist", () => {
  const patched = patchMaestroDataDevCors(remoteSource);
  assert.equal(patched, remoteSource.replace(
    "  ...(isCxmDevelopmentProject ? [\n",
    '  ...(isCxmDevelopmentProject ? [\n    "http://127.0.0.1:4176",\n    "http://localhost:4176",\n',
  ));
  assert.match(patched, /"http:\/\/127\.0\.0\.1:4175"/);
  assert.match(patched, /"http:\/\/localhost:4175"/);
  assert.match(patched, /function corsHeaders/);
});

test("is idempotent when the two Dev preview origins are already present", () => {
  const patched = patchMaestroDataDevCors(remoteSource);
  assert.equal(patchMaestroDataDevCors(patched), patched);
});

test("fails closed when the downloaded source is not the expected Dev baseline", () => {
  assert.throws(() => patchMaestroDataDevCors(remoteSource.replace("tqmfuskvllpqmvayjuqu", "fwpisypiiezjhtqxlmqv")), /baseline Dev esperado/);
});

test("fails closed when the allowlist edit is only partially present", () => {
  const partial = remoteSource.replace(
    "  ...(isCxmDevelopmentProject ? [\n",
    '  ...(isCxmDevelopmentProject ? [\n    "http://127.0.0.1:4176",\n',
  );
  assert.throws(() => patchMaestroDataDevCors(partial), /parcialmente aplicada/);
});
