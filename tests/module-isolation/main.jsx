import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import IsolatedModuleContent from '../../src/components/IsolatedModuleContent.jsx';
import { lazyWithRetry } from '../../src/lib/lazyWithRetry.js';

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
          <IsolatedModuleContent moduleName="Jobs" fallback={<p role="status">Carregando Jobs</p>}><Jobs /></IsolatedModuleContent>
        )} />
        <Route path="/AdsBrain" element={(
          <IsolatedModuleContent moduleName="AdsBrain" fallback={<p role="status">Carregando Ads Brain</p>}><AdsBrain /></IsolatedModuleContent>
        )} />
        <Route path="/Dashboard" element={(
          <IsolatedModuleContent moduleName="Dashboard" fallback={<p role="status">Carregando Dashboard</p>}><Dashboard /></IsolatedModuleContent>
        )} />
        <Route path="/Financial" element={(
          <IsolatedModuleContent moduleName="Financial" fallback={<p role="status">Carregando Financeiro</p>}><Financial /></IsolatedModuleContent>
        )} />
      </Routes>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')).render(<TestRoutes />);
