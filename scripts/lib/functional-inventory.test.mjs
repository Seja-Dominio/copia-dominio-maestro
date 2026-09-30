import test from "node:test";
import assert from "node:assert/strict";
import {
  extractFrontendEntities,
  extractFrontendOperations,
  extractRouteAccess,
  extractRoutedPaths,
  findUndocumentedInventoryItems,
  findUndocumentedOperations,
  findUndocumentedRouteAccess,
  findIncompleteEntityDispositions,
  findLegacyCutoverStatusGaps,
} from "./functional-inventory.mjs";

test("extracts user-facing routes and ignores root and catch-all routes", () => {
  assert.deepEqual(extractRoutedPaths(`
    <Route path="/" element={<Home />} />
    <Route path="/Jobs" element={<Jobs />} />
    <Route path="/Jobs" element={<JobsAlias />} />
    <Route path="*" element={<NotFound />} />
  `), ["/Jobs"]);
});

test("maps authenticated routes, authenticated redirects, and public token routes", () => {
  const app = `
    <Route path="/Dashboard" element={<P name="Dashboard"><Dashboard /></P>} />
    <Route path="/Proposals" element={<Navigate to="/CXM?section=proposals" replace />} />
    <Route path="/TestMaestroLab" element={
      <SafeBoundary><TestMaestroLab /></SafeBoundary>
    } />
    <Route path="/JobApproval" element={
      <SafeBoundary><JobApproval /></SafeBoundary>
    } />
    <Route path="/ClientWhatsappSetup" element={
      <SafeBoundary><ClientWhatsappSetup /></SafeBoundary>
    } />
  `;
  assert.deepEqual(extractRouteAccess(app), [
    { path: "/ClientWhatsappSetup", access: "public-token" },
    { path: "/Dashboard", access: "protected:Dashboard" },
    { path: "/JobApproval", access: "public-token" },
    { path: "/Proposals", access: "authenticated-redirect" },
    { path: "/TestMaestroLab", access: "public-demo" },
  ]);
});

test("detects undocumented or stale route access contracts", () => {
  const routes = [
    { path: "/Dashboard", access: "protected:Dashboard" },
    { path: "/JobApproval", access: "public-token" },
  ];
  const document = `### Contrato de acesso às rotas\n| Rota | Acesso |\n|---|---|\n| \`/Dashboard\` | protected:Dashboard |\n| \`/Old\` | public-token |\n`;
  assert.deepEqual(findUndocumentedRouteAccess({ routes, document }), {
    missing: [{ path: "/JobApproval", access: "public-token" }],
    stale: [["/Old", "public-token"]],
  });
});

test("collects distinct explicit entity references across source files", () => {
  assert.deepEqual(extractFrontendEntities([
    "maestro.entities.Client.list(); maestro.entities.Job.update(id, patch)",
    "maestro.entities.Client.filter(query)",
  ]), ["Client", "Job"]);
});

test("extracts explicit frontend operations per entity", () => {
  assert.deepEqual(extractFrontendOperations([
    "maestro.entities.Client.list(); maestro.entities.Job.update(id, patch)",
    "maestro.entities.Client.filter(query); maestro.entities.Client.list()",
  ]), ["Client.filter", "Client.list", "Job.update"]);
});

test("resolves concrete operations behind Recovery, safeDelete, and paginated CXM adapters", () => {
  assert.deepEqual(extractFrontendOperations([
    `const ENTITY_MAP = { fee_contract: "FeeContract", supplier: "Supplier" };\n` +
      `if (entityName) await maestro.entities[entityName].create(data);`,
    `await safeDelete("supplier", "Supplier", supplier);`,
    `async function loadAllEntityRows(entity) { return maestro.entities[entity].list(); }\n` +
      `loadAllEntityRows("AttendanceMessage", 1000);`,
  ]), [
    "AttendanceMessage.list",
    "FeeContract.create",
    "Supplier.create",
    "Supplier.delete",
  ]);
});

test("checks operations and entities outside the relational cutover registry against the map", () => {
  const document = `
### Matriz estática de operações e consumidores fora do registry
| Domínio | Entidade | Operações chamadas no frontend | Consumidores |
|---|---|---|---|
| Config | \`AppConfig\` | filter, create, update | settings |
| Tasks | \`MiniTask\` | list, create | tasks |
`;
  assert.deepEqual(findUndocumentedOperations({
    operations: ["AppConfig.filter", "AppConfig.create", "AppConfig.update", "MiniTask.create", "MiniTask.delete", "Supplier.list"],
    registryEntities: ["Client", "Job"],
    document,
  }), {
    outsideRegistry: ["AppConfig", "MiniTask", "Supplier"],
    missingEntities: ["Supplier"],
    missingOperations: ["MiniTask.delete", "Supplier.list"],
    staleOperations: ["MiniTask.list"],
  });
});

test("reports route and entity references missing from the functional map", () => {
  assert.deepEqual(findUndocumentedInventoryItems({
    routes: ["/Jobs", "/Recovery"],
    entities: ["Client", "MiniTask"],
    document: "Routes: /Jobs; entities: Client",
  }), { routes: ["/Recovery"], entities: ["MiniTask"] });
});

test("requires source of truth, tenant owner, and a validation gate for every out-of-registry entity", () => {
  assert.deepEqual(findIncompleteEntityDispositions({
    entities: ["Client", "MiniTask", "Supplier"],
    dispositions: [
      { entity: "MiniTask", source_of_truth: "relational", tenant_owner: "organization_id", validation_gate: "cross-tenant test" },
      { entity: "Supplier", source_of_truth: "legacy_records", tenant_owner: "organization_id" },
      { entity: "StaleEntity", source_of_truth: "legacy", tenant_owner: "tenant", validation_gate: "test" },
    ],
  }), {
    unclassified: ["Client"],
    stale: ["StaleEntity"],
    missingContractFields: ["Supplier"],
  });
});

test("keeps explicit external-product dispositions outside active Maestro routes", () => {
  assert.deepEqual(findIncompleteEntityDispositions({
    entities: ["AppConfig"],
    dispositions: [
      { entity: "AppConfig", source_of_truth: "legacy", tenant_owner: "tenant", validation_gate: "test" },
      { entity: "CXMSegment", disposition: "cxm_domain_pending", source_of_truth: "legacy", tenant_owner: "tenant", validation_gate: "test" },
      { entity: "ClientWhatsappNumber", disposition: "external_adapter_legacy", source_of_truth: "provider plus legacy config", tenant_owner: "tenant", validation_gate: "test" },
    ],
  }), { unclassified: [], stale: [], missingContractFields: [] });
});

test("requires explicit legacy-retirement status and evidence for every out-of-registry entity", () => {
  assert.deepEqual(findLegacyCutoverStatusGaps({
    entities: ["Client", "MiniTask", "Supplier"],
    statuses: [
      { entity: "MiniTask", status: "in_progress", evidence: "consumer audit" },
      { entity: "Supplier", status: "not_applicable", evidence: "no legacy reads or rows" },
      { entity: "StaleEntity", status: "retired", evidence: "completed" },
      { entity: "Client", status: "retired", evidence: "" },
    ],
  }), {
    missing: [],
    stale: ["StaleEntity"],
    invalid: ["Client"],
  });
});

test("preserves cutover status for CXM entities outside the Maestro app inventory", () => {
  assert.deepEqual(findLegacyCutoverStatusGaps({
    entities: ["AppConfig"],
    statuses: [
      { entity: "AppConfig", status: "in_progress", evidence: "projection still active" },
      { entity: "CXMSegment", status: "not_started", evidence: "belongs to separate CXM runtime" },
      { entity: "ClientWhatsappNumber", status: "not_started", evidence: "provider-backed adapter remains external" },
    ],
    externalEntities: ["CXMSegment", "ClientWhatsappNumber"],
  }), { missing: [], stale: [], invalid: [] });
});
