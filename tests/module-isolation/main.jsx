import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import ModuleErrorBoundary from '../../src/components/ModuleErrorBoundary.jsx';
import lazyWithRetry from '../../src/lib/lazyWithRetry.js';

window.__moduleIsolationDocumentId = `${Date.now()}-${Math.random()}`;

const Jobs = lazyWithRetry(() => import('./modules/Jobs.jsx'));
const AdsBrain = lazyWithRetry(() => import('./modules/AdsBrain.jsx'));
const Dashboard = lazyWithRetry(() => import('./modules/Dashboard.jsx'));
const Financial = lazyWithRetry(() => import('./modules/Financial.jsx'));

function TestRoutes() {
  const initialRoute = new URLSearchParams(window.location.search).get('initial') || '/Jobs';

  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <nav>
        <Link to="/Jobs" data-testid="route-jobs">Jobs</Link>
        <Link to="/AdsBrain" data-testid="route-adsbrain">Ads Brain</Link>
        <Link to="/Dashboard" data-testid="route-dashboard">Dashboard</Link>
        <Link to="/Financial" data-testid="route-financial">Financeiro</Link>
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
        <Route path="/Dashboard" element={(
          <ModuleErrorBoundary moduleName="Dashboard">
            <Suspense fallback={<p role="status">Carregando Dashboard</p>}><Dashboard /></Suspense>
          </ModuleErrorBoundary>
        )} />
        <Route path="/Financial" element={(
          <ModuleErrorBoundary moduleName="Financial">
            <Suspense fallback={<p role="status">Carregando Financeiro</p>}><Financial /></Suspense>
          </ModuleErrorBoundary>
        )} />
      </Routes>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')).render(<TestRoutes />);
