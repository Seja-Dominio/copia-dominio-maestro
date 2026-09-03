import { Toaster } from "@/components/ui/toaster";
import { Suspense, useState, useEffect, lazy } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/components/AuthContext';
// Platform requires: import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { NavigationProvider } from '@/components/NavigationStack';
import CollaboratorLoginPanel from '@/components/auth/CollaboratorLoginPanel';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import InactivityGuard from '@/components/auth/InactivityGuard';
import { AppConfigProvider } from '@/lib/AppConfigContext';
import AppLayout from './Layout.jsx';
import { ConfirmDeleteProvider } from '@/components/ConfirmDeleteContext';

// Lazy imports with built-in retry to handle Vite HMR / recompilation failures
function lazyWithRetry(factory) {
  return lazy(() =>
    factory().catch(() =>
      new Promise(resolve => setTimeout(resolve, 1500)).then(() =>
        factory().catch(() =>
          new Promise(resolve => setTimeout(resolve, 2000)).then(() => factory())
        )
      )
    )
  );
}

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard.jsx'));
const Agenda = lazyWithRetry(() => import('./pages/Agenda.jsx'));
const ClientPortfolio = lazyWithRetry(() => import('./pages/ClientPortfolio.jsx'));
const Conversations = lazyWithRetry(() => import('./pages/Conversations.jsx'));
const Financial = lazyWithRetry(() => import('./pages/Financial.jsx'));
const Jobs = lazyWithRetry(() => import('./pages/Jobs.jsx'));
const Media = lazyWithRetry(() => import('./pages/Media.jsx'));
const Production = lazyWithRetry(() => import('./pages/Production.jsx'));
const Projects = lazyWithRetry(() => import('./pages/Projects.jsx'));
const Proposals = lazyWithRetry(() => import('./pages/Proposals.jsx'));
const Records = lazyWithRetry(() => import('./pages/Records.jsx'));
const Reports = lazyWithRetry(() => import('./pages/Reports.jsx'));
const Templates = lazyWithRetry(() => import('./pages/Templates.jsx'));
const Settings = lazyWithRetry(() => import('./pages/Settings.jsx'));
const Configuracoes = lazyWithRetry(() => import('./pages/Configuracoes.jsx'));
const Documentos = lazyWithRetry(() => import('./pages/Documentos.jsx'));
const Recovery = lazyWithRetry(() => import('./pages/Recovery.jsx'));
const JobApproval = lazyWithRetry(() => import('./pages/JobApproval.jsx'));
const InstagramPage = lazyWithRetry(() => import('./pages/Instagram.jsx'));



// Error boundary with auto-reload
import React from 'react';
class SafeBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error) {
    console.error('[SafeBoundary] caught:', error?.message);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
          <p className="text-destructive font-semibold">Erro ao carregar</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-[60vh]">
    <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) => (
  <AppLayout currentPageName={currentPageName}>{children}</AppLayout>
);

const P = ({ name, children }) => (
  <LayoutWrapper currentPageName={name}>
    <ProtectedRoute pageName={name}>
      <SafeBoundary>
        <Suspense fallback={<LoadingFallback />}>
          {children}
        </Suspense>
      </SafeBoundary>
    </ProtectedRoute>
  </LayoutWrapper>
);

const RouteTracker = () => {
  const [, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const handler = () => {
      const p = window.location.pathname;
      if (p && p !== "/") sessionStorage.setItem("lastRoute", p);
      setPath(p);
    };
    window.addEventListener("popstate", handler);
    const origPush = window.history.pushState.bind(window.history);
    window.history.pushState = (...args) => { origPush(...args); handler(); };
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return null;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, user, setUser } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <CollaboratorLoginPanel onLoginSuccess={(collab) => setUser(collab)} />;
  }

  const handleInactivityLogout = () => {
    sessionStorage.removeItem("collaborator");
    window.location.href = "/";
  };

  const lastRoute = sessionStorage.getItem("lastRoute");

  return (
    <>
      <InactivityGuard onLogout={handleInactivityLogout} />
      <RouteTracker />
      <Routes>
        <Route path="/" element={<Navigate to={lastRoute || "/Dashboard"} replace />} />
        <Route path="/Dashboard" element={<P name="Dashboard"><Dashboard /></P>} />
        <Route path="/Agenda" element={<P name="Agenda"><Agenda /></P>} />
        <Route path="/ClientPortfolio" element={<P name="ClientPortfolio"><ClientPortfolio /></P>} />
        <Route path="/Conversations" element={<P name="Conversations"><Conversations /></P>} />
        <Route path="/Financial" element={<P name="Financial"><Financial /></P>} />
        <Route path="/Jobs" element={<P name="Jobs"><Jobs /></P>} />
        <Route path="/Media" element={<P name="Media"><Media /></P>} />
        <Route path="/Production" element={<P name="Production"><Production /></P>} />
        <Route path="/Projects" element={<P name="Projects"><Projects /></P>} />
        <Route path="/Proposals" element={<P name="Proposals"><Proposals /></P>} />
        <Route path="/Records" element={<P name="Records"><Records /></P>} />
        <Route path="/Reports" element={<P name="Reports"><Reports /></P>} />
        <Route path="/Templates" element={<P name="Templates"><Templates /></P>} />
        <Route path="/Settings" element={<P name="Settings"><Settings /></P>} />
        <Route path="/Configuracoes" element={<P name="Configuracoes"><Configuracoes /></P>} />
        <Route path="/Documentos" element={<P name="Documentos"><Documentos /></P>} />
        <Route path="/Recovery" element={<P name="Recovery"><Recovery /></P>} />
        <Route path="/Instagram" element={<P name="Instagram"><InstagramPage /></P>} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </>
  );
};

function App() {
  return (
    <SafeBoundary>
      <AuthProvider>
        <AppConfigProvider>
          <QueryClientProvider client={queryClientInstance}>
            <ConfirmDeleteProvider>
            <Router>
              <NavigationProvider>
                <Routes>
                  <Route path="/JobApproval" element={
                    <SafeBoundary>
                      <Suspense fallback={<LoadingFallback />}><JobApproval /></Suspense>
                    </SafeBoundary>
                  } />
                  <Route path="*" element={<AuthenticatedApp />} />
                </Routes>
              </NavigationProvider>
            </Router>
            <Toaster />
            </ConfirmDeleteProvider>
          </QueryClientProvider>
        </AppConfigProvider>
      </AuthProvider>
    </SafeBoundary>
  );
}

export default App;