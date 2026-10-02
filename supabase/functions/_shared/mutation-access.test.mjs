import test from "node:test";
import assert from "node:assert/strict";
import { authorizeCollaboratorJobPatch } from "./mutation-access.js";

test("attachment-only job patches still require assignment authorization", async () => {
  let assignmentChecks = 0;
  const allowed = await authorizeCollaboratorJobPatch({ attachments: [{ name: "proof.png" }] }, async () => {
    assignmentChecks += 1;
  });

  assert.equal(allowed, true);
  assert.equal(assignmentChecks, 1);
});

test("disallowed collaborator job patches fail before assignment authorization", async () => {
  let assignmentChecks = 0;
  const allowed = await authorizeCollaboratorJobPatch({ organization_id: "other-tenant" }, async () => {
    assignmentChecks += 1;
  });

  assert.equal(allowed, false);
  assert.equal(assignmentChecks, 0);
});

test("attachment patch authorization propagates an unassigned-job denial", async () => {
  await assert.rejects(
    authorizeCollaboratorJobPatch({ attachments: [] }, async () => {
      throw new Error("Você não está atribuído a este job");
    }),
    /não está atribuído/,
  );
});
