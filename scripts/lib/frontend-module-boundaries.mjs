import path from "node:path";

const SOURCE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];

export function extractLocalModuleSpecifiers(source) {
  const specifiers = new Set();
  const staticImports = /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?["']([^"']+)["']/g;
  const dynamicImports = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const expression of [staticImports, dynamicImports]) {
    for (const match of source.matchAll(expression)) specifiers.add(match[1]);
  }

  return [...specifiers].filter((specifier) => specifier.startsWith("@/") || specifier.startsWith("."));
}

function resolveSpecifier(importer, specifier, sourceFiles) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const base = cleanSpecifier.startsWith("@/")
    ? path.posix.normalize(`src/${cleanSpecifier.slice(2)}`)
    : path.posix.normalize(path.posix.join(path.posix.dirname(importer), cleanSpecifier));
  const candidates = path.posix.extname(base)
    ? [base]
    : [base, ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`)];
  return candidates.find((candidate) => sourceFiles.has(candidate));
}

function matchesForbiddenPath(sourcePath, forbiddenPath) {
  return forbiddenPath.endsWith("/")
    ? sourcePath.startsWith(forbiddenPath)
    : sourcePath === forbiddenPath;
}

export function analyzeModuleBoundaries({ sources, modules }) {
  const sourceFiles = new Set(Object.keys(sources));
  const violations = [];
  const unresolved = [];

  for (const [moduleName, contract] of Object.entries(modules)) {
    if (!sourceFiles.has(contract.entry)) {
      unresolved.push(`${moduleName}: entry not found: ${contract.entry}`);
      continue;
    }

    const visited = new Set();
    const pending = [contract.entry];
    while (pending.length) {
      const current = pending.pop();
      if (visited.has(current)) continue;
      visited.add(current);

      for (const forbiddenPath of contract.forbidden || []) {
        if (matchesForbiddenPath(current, forbiddenPath)) {
          violations.push(`${moduleName}: forbidden dependency ${current}`);
        }
      }

      for (const specifier of extractLocalModuleSpecifiers(sources[current] || "")) {
        const resolved = resolveSpecifier(current, specifier, sourceFiles);
        if (!resolved) {
          unresolved.push(`${moduleName}: cannot resolve ${specifier} from ${current}`);
          continue;
        }
        pending.push(resolved);
      }
    }
  }

  return { violations: [...new Set(violations)].sort(), unresolved: [...new Set(unresolved)].sort() };
}

export function hasRouteScopedErrorBoundary(appSource) {
  const pageWrapper = appSource.match(/const P\s*=\s*\(\{[\s\S]*?\n\s*\);/)?.[0] || "";
  return /<IsolatedModuleContent\s+moduleName=\{name\}[\s\S]*?fallback=\{[\s\S]*?\}>[\s\S]*?<\/IsolatedModuleContent>/.test(pageWrapper);
}

export function hasModuleRoutesWrapped(appSource, moduleNames) {
  return moduleNames.every((name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const route = new RegExp(
      `<Route\\s+path=["']/` + escapedName + `["']\\s+element=\\{\\s*<P\\s+name=["']` + escapedName +
        `["']\\s*>\\s*<` + escapedName + `\\s*/>\\s*</P>\\s*\\}\\s*/>`,
    );
    return route.test(appSource);
  });
}
