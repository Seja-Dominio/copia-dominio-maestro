import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { entityHasProductClassification, hasActiveOrganizationProduct, hasEntityProductAccess, knownProductForEntity } from "./organization-products.mjs";

test("requires an active or trial product belonging to the requested organization result", () => {
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "enabled" }], "maestro"), true);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "trial" }], "maestro"), true);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "cxm", status: "enabled" }], "maestro"), false);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "cancelled" }], "maestro"), false);
  assert.equal(hasActiveOrganizationProduct(null, "maestro"), false);
});

test("entity access follows classified product entitlement and fails closed on conflicting classifications", () => {
  const products = [
    { product_key: "maestro", status: "enabled" },
    { product_key: "cxm", status: "suspended" },
    { product_key: "insights", status: "trial" },
  ];
  assert.equal(entityHasProductClassification("Proposal", ""), true);
  assert.equal(hasEntityProductAccess("Proposal", "", products), false);
  assert.equal(hasEntityProductAccess("Proposal", "", [{ product_key: "cxm", status: "enabled" }]), true);
  assert.equal(hasEntityProductAccess("Proposal", "maestro", products), false);
  assert.equal(hasEntityProductAccess("FinancialEntry", "maestro", []), true);
  assert.equal(hasEntityProductAccess("UnclassifiedEntity", "", products), true);
  assert.equal(hasEntityProductAccess("UnknownEntity", "unknown_product", products), false);
});

test("product fallback classifications match every non-Maestro entity seeded in the cutover registry", async () => {
  const migration = await fs.readFile(new URL("../../migrations/20260926550000_create_legacy_cutover_registry.sql", import.meta.url), "utf8");
  const seedValues = migration.split(/\bvalues\b/i)[1]?.split(/\bon conflict\b/i)[0] || "";
  const registryProducts = [...seedValues.matchAll(/\('([^']+)', '(cxm|ads_brain|insights)'/g)]
    .map(([, entity, product]) => [entity, product])
    .sort(([left], [right]) => left.localeCompare(right));
  const fallbackProducts = registryProducts
    .map(([entity]) => [entity, knownProductForEntity(entity)])
    .sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(fallbackProducts, registryProducts);
});

test("system reports checks the Maestro entitlement within the authenticated organization", async () => {
  const source = await fs.readFile(new URL("../system-reports/index.ts", import.meta.url), "utf8");
  assert.match(source, /\.from\("organization_products"\)/);
  assert.match(source, /\.eq\("organization_id", sessionPayload\.organization_id\)/);
  assert.match(source, /hasActiveOrganizationProduct\(products, "maestro"\)/);
});

test("Maestro data enforces product entitlements from the entity registry before CRUD", async () => {
  const source = await fs.readFile(new URL("../maestro-data/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("legacy_cutover_registry"\)/);
  assert.match(source, /\.eq\("entity", entity\)[\s\S]{0,60}\.maybeSingle\(\)/);
  assert.match(source, /from\("organization_products"\)/);
  assert.match(source, /\.eq\("organization_id", session\.organization_id\)/);
  assert.match(source, /entityHasProductClassification\(entity, registryEntry\?\.module_key\)/);
  assert.match(source, /hasEntityProductAccess\(entity, registryEntry\?\.module_key, products \|\| \[\]\)/);
  assert.match(source, /Produto não habilitado para esta organização/);
});

test("Maestro AI checks the CXM entitlement before reading commercial proposals", async () => {
  const source = await fs.readFile(new URL("../maestro-ai/index.ts", import.meta.url), "utf8");
  const commercial = source.indexOf('if (name === "consultar_comercial")');
  const proposalRead = source.indexOf('listRows("Proposal", session.organization_id)', commercial);
  const entitlement = source.indexOf('hasActiveOrganizationProduct(products || [], "cxm")', commercial);
  assert.ok(commercial >= 0);
  assert.ok(entitlement > commercial && entitlement < proposalRead);
  assert.match(source, /A área Comercial exige o produto CXM habilitado para esta organização/);
});
