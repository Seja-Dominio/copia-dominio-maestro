import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeModuleBoundaries, hasRouteScopedErrorBoundary } from "./lib/frontend-module-boundaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "scripts/config/frontend-module-boundaries.json"), "utf8"));
const appSource = await fs.readFile(path.join(root, "src/App.jsx"), "utf8");
const sources = {};

async function readSources(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) await readSources(absolutePath);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      sources[relativePath] = await fs.readFile(absolutePath, "utf8");
    }
  }
}

await readSources(path.join(root, "src"));
const { violations, unresolved } = analyzeModuleBoundaries({ sources, modules: manifest.modules });
const routeBoundaryPresent = hasRouteScopedErrorBoundary(appSource);
if (!routeBoundaryPresent) violations.push("App: lazy routes must have a route-scoped error boundary");

console.log(JSON.stringify({
  status: violations.length || unresolved.length ? "failed" : "ok",
  modules_checked: Object.keys(manifest.modules).length,
  route_scoped_error_boundary: routeBoundaryPresent,
  violations,
  unresolved,
}, null, 2));

if (violations.length || unresolved.length) process.exitCode = 1;
