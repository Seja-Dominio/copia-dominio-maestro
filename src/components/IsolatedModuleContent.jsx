import { Suspense } from 'react';
import ModuleErrorBoundary from './ModuleErrorBoundary';

export default function IsolatedModuleContent({ moduleName, fallback, children }) {
  return (
    <ModuleErrorBoundary moduleName={moduleName}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ModuleErrorBoundary>
  );
}
