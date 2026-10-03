import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import ModuleErrorBoundary from '../../src/components/ModuleErrorBoundary.jsx';
import lazyWithRetry from '../../src/lib/lazyWithRetry.js';

const Jobs = lazyWithRetry(() => import('./modules/Jobs.jsx'));
const AdsBrain = lazyWithRetry(() => import('./modules/AdsBrain.jsx'));

function TestRoutes() {
  const initialRoute = new URLSearchParams(window.location.search).get('initial') || '/Jobs';

  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <nav>
        <Link to="/Jobs">Jobs</Link>
        <Link to="/AdsBrain">Ads Brain</Link>
      </nav>
      <Routes>
        <Route path="/Jobs" element={(
          <ModuleErrorBoundary moduleName="Jobs">
            <Suspense fallback={<p role="status">Carregando Jobs</p>}><Jobs /></Suspense>
          </ModuleErrorBoundary>
        )} />
        <Route path="/AdsBrain" element={(
          <ModuleErrorBoundary moduleName="AdsBrain">
            <Suspense fallback={<p role="status">Carregando Ads Brain</p>}><AdsBrain /></Suspense>
          </ModuleErrorBoundary>
        )} />
      </Routes>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')).render(<TestRoutes />);
