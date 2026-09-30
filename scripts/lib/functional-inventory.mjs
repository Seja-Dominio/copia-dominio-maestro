const ROUTE_PATH = /<Route\s+path="([^"]+)"/g;
const ENTITY_REFERENCE = /maestro\.entities\.([A-Z][A-Za-z0-9_]*)/g;
const ENTITY_OPERATION = /maestro\.entities\.([A-Z][A-Za-z0-9_]*)\.(list|filter|create|update|delete|subscribe)\s*\(/g;
const DOCUMENTED_OPERATION = /\b(list|filter|create|update|delete|subscribe)\b/g;
const AUTHENTICATED_ROUTE = /<Route\s+path="([^"]+)"\s+element=\{<P\s+name="([^"]+)"/g;
const AUTHENTICATED_REDIRECT_ROUTE = /<Route\s+path="([^"]+)"\s+element=\{<Navigate/g;
const PUBLIC_TOKEN_ROUTE = /<Route\s+path="(\/JobApproval|\/ClientWhatsappSetup)"\s+element=\{/g;
const PUBLIC_DEMO_ROUTE = /<Route\s+path="(\/TestMaestroLab)"\s+element=\{/g;

export function extractRoutedPaths(appSource) {
  return [...new Set([...appSource.matchAll(ROUTE_PATH)]
    .map(([, path]) => path)
    .filter((path) => path !== "/" && path !== "*"))].sort();
}

export function extractRouteAccess(appSource) {
  const routes = new Map();
  for (const [, path, pageName] of appSource.matchAll(AUTHENTICATED_ROUTE)) {
    routes.set(path, `protected:${pageName}`);
  }
  for (const [, path] of appSource.matchAll(AUTHENTICATED_REDIRECT_ROUTE)) {
    routes.set(path, "authenticated-redirect");
  }
  for (const [, path] of appSource.matchAll(PUBLIC_TOKEN_ROUTE)) {
    routes.set(path, "public-token");
  }
  for (const [, path] of appSource.matchAll(PUBLIC_DEMO_ROUTE)) {
    routes.set(path, "public-demo");
  }
  if (/<Route\s+path="\/"\s+element=\{<Navigate/.test(appSource)) {
    routes.set("/", "authenticated-redirect");
  }
  return [...routes].sort(([left], [right]) => left.localeCompare(right))
    .map(([path, access]) => ({ path, access }));
}

export function findUndocumentedRouteAccess({ routes, document }) {
  const sectionStart = document.indexOf("### Contrato de acesso às rotas");
  const sectionEnd = sectionStart < 0 ? -1 : document.indexOf("\n### ", sectionStart + 1);
  const section = sectionStart < 0 ? "" : document.slice(sectionStart, sectionEnd < 0 ? undefined : sectionEnd);
  const documented = new Map([...section.matchAll(/^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|/gm)]
    .map(([, path, access]) => [path, access.trim()]));
  const missing = routes.filter(({ path, access }) => documented.get(path) !== access);
  const stale = [...documented].filter(([path, access]) => !routes.some((route) => route.path === path && route.access === access));
  return { missing, stale };
}

export function extractFrontendEntities(sourceFiles) {
  const entities = new Set();
  for (const source of sourceFiles) {
    for (const [, entity] of source.matchAll(ENTITY_REFERENCE)) entities.add(entity);
  }
  return [...entities].sort();
}

export function extractFrontendOperations(sourceFiles) {
  const operations = new Set();
  const sources = sourceFiles.map((source) => typeof source === "string" ? source : source.content);
  const add = (entity, operation) => operations.add(`${entity}.${operation}`);

  for (const source of sources) {
    for (const [, entity, operation] of source.matchAll(ENTITY_OPERATION)) {
      add(entity, operation);
    }

    if (/maestro\.entities\[entityName\]\.create\s*\(/.test(source)) {
      const entityMap = source.match(/const\s+ENTITY_MAP\s*=\s*\{([\s\S]*?)\};/);
      for (const [, entity] of entityMap?.[1].matchAll(/\b[a-z_][A-Za-z0-9_]*\s*:\s*"([A-Z][A-Za-z0-9_]*)"/g) || []) {
        add(entity, "create");
      }
    }

    for (const [, entity] of source.matchAll(/safeDelete\(\s*"[^"]+"\s*,\s*"([A-Z][A-Za-z0-9_]*)"/g)) {
      add(entity, "delete");
    }

    if (/maestro\.entities\[entity\]\.list\s*\(/.test(source)) {
      for (const [, entity] of source.matchAll(/loadAllEntityRows\(\s*"([A-Z][A-Za-z0-9_]*)"/g)) {
        add(entity, "list");
      }
    }
  }
  return [...operations].sort();
}

export function findUndocumentedOperations({ operations, registryEntities, document }) {
  const registry = new Set(registryEntities);
  const matrixStart = document.indexOf("### Matriz estática de operações e consumidores fora do registry");
  const matrix = matrixStart < 0 ? "" : document.slice(matrixStart);
  const documented = new Map();

  for (const line of matrix.split(/\r?\n/)) {
    const columns = line.split("|").map((column) => column.trim());
    const entity = columns[2]?.match(/`([A-Z][A-Za-z0-9_]*)`/)?.[1];
    if (!entity) continue;
    const rowOperations = new Set([...((columns[3] || "").matchAll(DOCUMENTED_OPERATION))]
      .map(([, operation]) => `${entity}.${operation}`));
    documented.set(entity, rowOperations);
  }

  const outsideRegistry = [...new Set(operations
    .map((item) => item.split(".")[0])
    .filter((entity) => !registry.has(entity)))].sort();
  const missingEntities = outsideRegistry.filter((entity) => !documented.has(entity));
  const sourceEntities = new Set(operations.map((item) => item.split(".")[0]));
  const missingOperations = operations.filter((item) => {
    const [entity] = item.split(".");
    return !registry.has(entity) && !documented.get(entity)?.has(item);
  });
  const staleOperations = [...documented.entries()]
    .filter(([entity]) => !registry.has(entity) && sourceEntities.has(entity))
    .flatMap(([, documentedForEntity]) => [...documentedForEntity])
    .filter((item) => !operations.includes(item));

  return { outsideRegistry, missingEntities, missingOperations, staleOperations };
}

export function findUndocumentedInventoryItems({ routes, entities, document }) {
  return {
    routes: routes.filter((route) => !document.includes(route)),
    entities: entities.filter((entity) => !document.includes(entity)),
  };
}

export function findIncompleteEntityDispositions({ entities, dispositions }) {
  const byEntity = new Map(dispositions.map((item) => [item.entity, item]));
  const unclassified = entities.filter((entity) => !byEntity.has(entity));
  const stale = dispositions.map((item) => item.entity).filter((entity) => !entities.includes(entity));
  const missingContractFields = dispositions
    .filter((item) => ![item.source_of_truth, item.tenant_owner, item.validation_gate]
      .every((value) => typeof value === "string" && value.trim()))
    .map(({ entity }) => entity);
  return { unclassified, stale, missingContractFields };
}

export function findLegacyCutoverStatusGaps({ entities, statuses }) {
  const byEntity = new Map(statuses.map((item) => [item.entity, item]));
  const allowedStatuses = new Set(["not_started", "in_progress", "retired", "not_applicable"]);
  const missing = entities.filter((entity) => !byEntity.has(entity));
  const stale = statuses.map((item) => item.entity).filter((entity) => !entities.includes(entity));
  const invalid = statuses.filter((item) => !allowedStatuses.has(item.status)
    || !String(item.evidence || "").trim())
    .map(({ entity }) => entity);
  return { missing, stale, invalid };
}
