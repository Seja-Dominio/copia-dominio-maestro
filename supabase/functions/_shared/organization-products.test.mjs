import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { hasActiveOrganizationProduct } from "./organization-products.mjs";

test("requires an active or trial product belonging to the requested organization result", () => {
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "enabled" }], "maestro"), true);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "trial" }], "maestro"), true);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "cxm", status: "enabled" }], "maestro"), false);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "cancelled" }], "maestro"), false);
  assert.equal(hasActiveOrganizationProduct(null, "maestro"), false);
});

test("system reports checks the Maestro entitlement within the authenticated organization", async () => {
  const source = await fs.readFile(new URL("../system-reports/index.ts", import.meta.url), "utf8");
  assert.match(source, /\.from\("organization_products"\)/);
  assert.match(source, /\.eq\("organization_id", sessionPayload\.organization_id\)/);
  assert.match(source, /hasActiveOrganizationProduct\(products, "maestro"\)/);
});
