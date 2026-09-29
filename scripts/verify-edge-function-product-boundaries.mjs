import fs from "node:fs/promises";
import { validateEdgeFunctionProductBoundaries } from "./lib/edge-function-product-boundaries.mjs";

const functionRoot = new URL("../supabase/functions/", import.meta.url);
const manifestUrl = new URL("./config/edge-function-product-boundaries.json", import.meta.url);
const directories = (await fs.readdir(functionRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
  .map((entry) => entry.name)
  .sort();
const manifest = JSON.parse(await fs.readFile(manifestUrl, "utf8"));
const result = validateEdgeFunctionProductBoundaries({ functionDirectories: directories, manifest });

console.log(JSON.stringify(result, null, 2));
const requireReleaseReady = process.argv.includes("--require-release-ready");
if (result.status !== "ok" || (requireReleaseReady && !result.release_ready)) process.exitCode = 1;
