import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCollaboratorSession } from "../../src/lib/collaborator-session.mjs";

function token(payload, signature = "signature") {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature}`;
}

const collaborator = { id: "collab-1", organization_id: "org-1", name: "User" };
const collaboratorJson = JSON.stringify(collaborator);

test("accepts an unexpired collaborator session for the same collaborator and tenant", () => {
  assert.deepEqual(
    parseCollaboratorSession(collaboratorJson, token({ sub: "collab-1", organization_id: "org-1", exp: 200 }), 100),
    collaborator,
  );
});

test("rejects missing, malformed, expired, mismatched, or tenant-mismatched sessions", () => {
  assert.equal(parseCollaboratorSession(collaboratorJson, null, 100), null);
  assert.equal(parseCollaboratorSession(collaboratorJson, "not-a-session", 100), null);
  assert.equal(parseCollaboratorSession(collaboratorJson, token({ sub: "collab-1", exp: 100 }), 100), null);
  assert.equal(parseCollaboratorSession(collaboratorJson, token({ sub: "collab-2", exp: 200 }), 100), null);
  assert.equal(parseCollaboratorSession(collaboratorJson, token({ sub: "collab-1", organization_id: "org-2", exp: 200 }), 100), null);
});

test("rejects collaborator cache without its signed session payload", () => {
  assert.equal(parseCollaboratorSession(collaboratorJson, ".signature", 100), null);
  assert.equal(parseCollaboratorSession("{", token({ sub: "collab-1", exp: 200 }), 100), null);
});

test("collaborator login returns the canonical database id in the HMAC-bound profile", () => {
  const endpoint = readFileSync(fileURLToPath(new URL("../../supabase/functions/collaborator-login/index.ts", import.meta.url)), "utf8");
  assert.match(endpoint, /const collaborator = \{\s*\.\.\.data\.profile,\s*id: data\.id,/);
  assert.match(endpoint, /sub: data\.id,[\s\S]*organization_id: membership\.organization_id/);
});

test("collaborator login derives signed tenant and privileges from one active selected membership", () => {
  const endpoint = readFileSync(fileURLToPath(new URL("../../supabase/functions/collaborator-login/index.ts", import.meta.url)), "utf8");
  assert.match(endpoint, /\.from\("organization_members"\)[\s\S]*?\.eq\("status", "active"\)[\s\S]*?\.eq\("organizations\.status", "active"\)/);
  assert.match(endpoint, /selectOrganizationMembership\(memberships, requestedOrganizationId\)/);
  assert.match(endpoint, /organizationChoice\.reason === "organization_required"/);
  assert.match(endpoint, /const accessLevel = accessLevelForOrganizationRole\(membership\.organization_role\)/);
  assert.match(endpoint, /signSession\(\{[\s\S]*?access_level: accessLevel,[\s\S]*?organization_id: membership\.organization_id/);
  assert.doesNotMatch(endpoint, /const rawAccessLevel = String\(data\.profile\?/);
});
