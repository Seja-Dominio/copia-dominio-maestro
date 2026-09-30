import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { entityHasProductClassification, hasActiveOrganizationProduct, hasEntityProductAccess, knownProductForEntity } from "./organization-products.mjs";

test("requires an active or trial product belonging to the requested organization result", () => {
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "enabled" }], "maestro"), true);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "trial" }], "maestro"), true);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "cxm", status: "enabled" }], "maestro"), false);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "cancelled" }], "maestro"), false);
  const now = Date.parse("2026-09-30T12:00:00.000Z");
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "enabled", expires_at: "2026-09-30T12:00:01.000Z" }], "maestro", now), true);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "enabled", expires_at: "2026-09-30T11:59:59.000Z" }], "maestro", now), false);
  assert.equal(hasActiveOrganizationProduct([{ product_key: "maestro", status: "enabled", expires_at: "invalid" }], "maestro", now), false);
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
  assert.equal(hasEntityProductAccess("FinancialEntry", "maestro", []), false);
  assert.equal(hasEntityProductAccess("FinancialEntry", "maestro", [{ product_key: "maestro", status: "enabled" }]), true);
  assert.equal(entityHasProductClassification("UnclassifiedEntity", ""), false);
  assert.equal(hasEntityProductAccess("UnclassifiedEntity", "", products), false);
  assert.equal(hasEntityProductAccess("UnknownEntity", "unknown_product", products), false);
});

test("all application entity APIs have an explicit fallback product classification", async () => {
  const productSource = await fs.readFile(new URL("./organization-products.mjs", import.meta.url), "utf8");
  const applicationEntities = [
    "AgendaEvent", "AppConfig", "BankAccount", "Client", "ClientCompetitor", "ClientInsight", "Collaborator", "Comment",
    "CostCenter", "DeleteLog", "FeeContract", "FinancialCategory", "FinancialEntry", "Job", "JobHistory", "JobTemplate",
    "MasterRequest", "MiniTask", "Note", "Notification", "NpsEntry", "NpsHistory", "PostMetric", "Project",
    "ProjectTemplate", "Proposal", "SavingsBox", "SavingsTransaction", "Squad", "Subtask", "Supplier", "Timesheet",
  ];
  const explicitFallbacks = new Set([...productSource.matchAll(/\["([A-Za-z][A-Za-z0-9_]*)", "(?:maestro|cxm|ads_brain|insights)"\]/g)].map(([, entity]) => entity));
  const uncovered = [...new Set(applicationEntities)].filter((entity) => !explicitFallbacks.has(entity));
  assert.deepEqual(uncovered, []);
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
  assert.match(source, /\.select\("product_key,status,expires_at"\)/);
});

test("Maestro data enforces product entitlements from the entity registry before CRUD", async () => {
  const source = await fs.readFile(new URL("../maestro-data/index.ts", import.meta.url), "utf8");
  assert.match(source, /from\("legacy_cutover_registry"\)/);
  assert.match(source, /\.eq\("entity", entity\)[\s\S]{0,60}\.maybeSingle\(\)/);
  assert.match(source, /from\("organization_products"\)/);
  assert.match(source, /\.eq\("organization_id", session\.organization_id\)/);
  assert.match(source, /entityHasProductClassification\(entity, registryEntry\?\.module_key\)/);
  assert.match(source, /hasEntityProductAccess\(entity, registryEntry\?\.module_key, products \|\| \[\]\)/);
  assert.match(source, /\.select\("product_key,status,expires_at"\)/);
  assert.match(source, /Produto não habilitado para esta organização/);
  assert.match(source, /if \(!entityHasProductClassification\(entity, registryEntry\?\.module_key\)\) \{[\s\S]*?Entidade sem classificação de produto/);
  assert.match(source, /if \(operation === "dashboard"\) \{[\s\S]*?hasActiveOrganizationProduct\(products, "maestro"\)/);
});

test("Maestro AI checks the CXM entitlement before reading commercial proposals", async () => {
  const source = await fs.readFile(new URL("../maestro-ai/index.ts", import.meta.url), "utf8");
  const commercial = source.indexOf('if (name === "consultar_comercial")');
  const proposalRead = source.indexOf('listRows("Proposal", session.organization_id)', commercial);
  const entitlement = source.indexOf('hasActiveOrganizationProduct(products || [], "cxm")', commercial);
  assert.ok(commercial >= 0);
  assert.ok(entitlement > commercial && entitlement < proposalRead);
  assert.match(source, /A área Comercial exige o produto CXM habilitado para esta organização/);
  assert.match(source, /\.select\("product_key,status,expires_at"\)/);
});

test("marketing mix snapshot requires one confirmed active-tenant client, Insights entitlement, and tenant-scoped observations", async () => {
  const source = await fs.readFile(new URL("../marketing-mix-snapshot/index.ts", import.meta.url), "utf8");
  const scopeLookup = source.indexOf('.from("organization_legacy_records")');
  const entitlementLookup = source.indexOf('.from("organization_products")', scopeLookup);
  const observationLookup = source.indexOf('.from("marketing_mix_observations")', entitlementLookup);
  assert.ok(scopeLookup >= 0 && entitlementLookup > scopeLookup && observationLookup > entitlementLookup);
  assert.match(source, /\.eq\("legacy_entity", "Client"\)[\s\S]*?\.eq\("legacy_record_id", clientId\)[\s\S]*?\.eq\("scope_status", "confirmed"\)[\s\S]*?\.eq\("organizations\.status", "active"\)[\s\S]*?\.limit\(2\)/);
  assert.match(source, /clientScopes\.length !== 1/);
  assert.match(source, /\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("product_key", "insights"\)[\s\S]*?\.in\("status", \["trial", "enabled"\]\)/);
  assert.match(source, /\.select\("product_key, status, expires_at"\)/);
  assert.match(source, /hasActiveOrganizationProduct\(products \|\| \[\], "insights"\)/);
  assert.match(source, /\.eq\("organization_id", organizationId\)[\s\S]*?\.eq\("client_id", clientId\)/);
});
