import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeModuleBoundaries,
  extractLocalModuleSpecifiers,
  hasModuleRoutesWrapped,
  hasRouteScopedErrorBoundary,
} from "./frontend-module-boundaries.mjs";

test("extracts static and lazy local imports but ignores packages", () => {
  assert.deepEqual(extractLocalModuleSpecifiers(`
    import React from "react";
    import { Button } from "@/components/ui/button";
    export { helper } from "../shared/helper.js";
    const Lazy = () => import("./Lazy.jsx");
  `), ["@/components/ui/button", "../shared/helper.js", "./Lazy.jsx"]);
});

test("finds forbidden dependencies transitively through shared code", () => {
  const sources = {
    "src/pages/AdsBrain.jsx": 'import "@/shared/ads-adapter";',
    "src/shared/ads-adapter.js": 'export { default } from "@/components/jobs/JobDetailModal";',
    "src/components/jobs/JobDetailModal.jsx": "export default function JobDetailModal() {}",
    "src/pages/Jobs.jsx": 'import "@/components/ui/button";',
    "src/components/ui/button.js": "export const Button = () => null;",
  };

  assert.deepEqual(analyzeModuleBoundaries({
    sources,
    modules: {
      AdsBrain: { entry: "src/pages/AdsBrain.jsx", forbidden: ["src/components/jobs/"] },
      Jobs: { entry: "src/pages/Jobs.jsx", forbidden: ["src/components/ads/"] },
    },
  }), {
    violations: ["AdsBrain: forbidden dependency src/components/jobs/JobDetailModal.jsx"],
    unresolved: [],
  });
});

test("does not mistake shared dependencies for cross-module dependencies", () => {
  const sources = {
    "src/pages/AdsBrain.jsx": 'import "@/components/ui/button";',
    "src/components/ui/button.js": "export const Button = () => null;",
  };
  assert.deepEqual(analyzeModuleBoundaries({
    sources,
    modules: { AdsBrain: { entry: "src/pages/AdsBrain.jsx", forbidden: ["src/components/jobs/"] } },
  }), { violations: [], unresolved: [] });
});

test("requires a route-local error boundary around each lazy page", () => {
  assert.equal(hasRouteScopedErrorBoundary(`
    const P = ({ name, children }) => (
      <LayoutWrapper currentPageName={name}>
        <ProtectedRoute pageName={name}>
          <SafeBoundary><Suspense fallback={<LoadingFallback />}>{children}</Suspense></SafeBoundary>
        </ProtectedRoute>
      </LayoutWrapper>
    );
  `), true);
  assert.equal(hasRouteScopedErrorBoundary(`const P = ({ children }) => <Suspense>{children}</Suspense>;`), false);
});

test("requires isolated module routes to use the protected page boundary", () => {
  const app = `
    <Route path="/Jobs" element={<P name="Jobs"><Jobs /></P>} />
    <Route path="/AdsBrain" element={<P name="AdsBrain"><AdsBrain /></P>} />
  `;
  assert.equal(hasModuleRoutesWrapped(app, ["Jobs", "AdsBrain"]), true);
  assert.equal(hasModuleRoutesWrapped(app.replace('<P name="AdsBrain"><AdsBrain /></P>', '<AdsBrain />'), ["Jobs", "AdsBrain"]), false);
  assert.equal(hasModuleRoutesWrapped(app, ["Jobs", "Missing"]), false);
});
