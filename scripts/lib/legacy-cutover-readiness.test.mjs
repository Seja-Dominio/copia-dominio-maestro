import test from "node:test";
import assert from "node:assert/strict";
import { assessLegacyRemovalReadiness } from "./legacy-cutover-readiness.mjs";

test("legacy removal requires every registry entity retired without legacy access", () => {
  assert.equal(assessLegacyRemovalReadiness([
    { entity: "Job", status: "retired", legacy_read_allowed: false, legacy_write_allowed: false },
  ], []).safeToRemoveLegacy, true);

  const frozen = assessLegacyRemovalReadiness([
    { entity: "Job", status: "frozen", legacy_read_allowed: true, legacy_write_allowed: false },
  ], []);
  assert.equal(frozen.safeToRemoveLegacy, false);
  assert.equal(frozen.entitiesNotRetired[0].entity, "Job");
});

test("pending integrity work or verification failures prevent legacy removal", () => {
  const retired = [{ entity: "Job", status: "retired", legacy_read_allowed: false, legacy_write_allowed: false }];
  assert.equal(assessLegacyRemovalReadiness(retired, [{ entity: "Job", records: 1 }]).safeToRemoveLegacy, false);
  assert.equal(assessLegacyRemovalReadiness(retired, [], ["parity_failed"]).safeToRemoveLegacy, false);
  assert.equal(assessLegacyRemovalReadiness([], []).safeToRemoveLegacy, false);
});

test("frontend entities outside the registry prevent legacy removal until explicitly retired or proven not applicable", () => {
  const retiredRegistry = [{ entity: "Job", status: "retired", legacy_read_allowed: false, legacy_write_allowed: false }];
  const pendingFrontendEntity = [{ entity: "Supplier", status: "not_started", evidence: "Still uses compatibility store." }];
  const pending = assessLegacyRemovalReadiness(retiredRegistry, [], [], pendingFrontendEntity);
  assert.equal(pending.safeToRemoveLegacy, false);
  assert.deepEqual(pending.nonRegistryEntitiesNotRetired.map(({ entity }) => entity), ["Supplier"]);

  assert.equal(assessLegacyRemovalReadiness(retiredRegistry, [], [], [
    { entity: "Supplier", status: "not_applicable", evidence: "No rows or reads in legacy_records; verified by migration gate." },
  ]).safeToRemoveLegacy, true);
  assert.equal(assessLegacyRemovalReadiness(retiredRegistry, [], [], [
    { entity: "Supplier", status: "not_applicable", evidence: "" },
  ]).safeToRemoveLegacy, false);
});
