import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
} from "./lib/functional-inventory.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const appSource = await fs.readFile(path.join(root, "src/App.jsx"), "utf8");
const map = await fs.readFile(path.join(root, "docs/system-functional-map.md"), "utf8");
const registryEntities = JSON.parse(await fs.readFile(
  path.join(root, "scripts/config/relational-read-entities.json"), "utf8",
));
const dispositions = JSON.parse(await fs.readFile(
  path.join(root, "scripts/config/frontend-entity-dispositions.json"), "utf8",
));
const nonRegistryCutoverStatuses = JSON.parse(await fs.readFile(
  path.join(root, "scripts/config/non-registry-cutover-status.json"), "utf8",
));

async function collectSourceFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(fullPath));
    else if (/\.[jt]sx?$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

const sourceFiles = await collectSourceFiles(path.join(root, "src"));
const sources = await Promise.all(sourceFiles.map((file) => fs.readFile(file, "utf8")));
const routes = extractRoutedPaths(appSource);
const routeAccess = extractRouteAccess(appSource);
const entities = extractFrontendEntities(sources);
const operations = extractFrontendOperations(sources);
const missing = findUndocumentedInventoryItems({ routes, entities, document: map });
const operationInventory = findUndocumentedOperations({ operations, registryEntities, document: map });
const routeAccessInventory = findUndocumentedRouteAccess({ routes: routeAccess, document: map });
const dispositionCoverage = findIncompleteEntityDispositions({
  entities: operationInventory.outsideRegistry,
  dispositions,
});
const { unclassified: unclassifiedEntities, stale: staleDispositions,
  missingContractFields: incompleteDispositions } = dispositionCoverage;
const legacyCutoverStatusGaps = findLegacyCutoverStatusGaps({
  entities: operationInventory.outsideRegistry,
  statuses: nonRegistryCutoverStatuses,
});

console.log(JSON.stringify({
  status: missing.routes.length || missing.entities.length || operationInventory.missingEntities.length || operationInventory.missingOperations.length || operationInventory.staleOperations.length || routeAccessInventory.missing.length || routeAccessInventory.stale.length || unclassifiedEntities.length || staleDispositions.length || incompleteDispositions.length || legacyCutoverStatusGaps.missing.length || legacyCutoverStatusGaps.stale.length || legacyCutoverStatusGaps.invalid.length ? "failed" : "ok",
  routes_checked: routes.length,
  route_access_contracts_checked: routeAccess.length,
  explicit_entities_checked: entities.length,
  frontend_entity_operations_checked: operations.length,
  entities_outside_relational_cutover_registry: operationInventory.outsideRegistry.length,
  entities_with_explicit_disposition: operationInventory.outsideRegistry.length - unclassifiedEntities.length,
  unclassified_entities: unclassifiedEntities,
  stale_dispositions: staleDispositions,
  dispositions_missing_contract_fields: incompleteDispositions,
  legacy_cutover_status_gaps: legacyCutoverStatusGaps,
  missing,
  operation_inventory: operationInventory,
  route_access_inventory: routeAccessInventory,
}, null, 2));

if (!routes.length || !entities.length || missing.routes.length || missing.entities.length || operationInventory.missingEntities.length || operationInventory.missingOperations.length || operationInventory.staleOperations.length || unclassifiedEntities.length || staleDispositions.length || incompleteDispositions.length || legacyCutoverStatusGaps.missing.length || legacyCutoverStatusGaps.stale.length || legacyCutoverStatusGaps.invalid.length || routeAccessInventory.missing.length || routeAccessInventory.stale.length) {
  process.exitCode = 1;
}
