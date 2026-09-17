import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearStoredCollaboratorSession, getStoredCollaborator, getStoredSessionToken, supabase } from '@/api/supabaseClient';

const AuthContext = createContext();
const AUTH_SESSION_TIMEOUT_MS = 5000;

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('A verificação da sessão demorou mais que o esperado.')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Verifica autenticação ao montar
  useEffect(() => {
    let mounted = true;
    const applySession = (session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);
        setAuthError(null);
        return true;
      }
      return false;
    };

    const checkAuth = async () => {
      try {
        // Custom collaborator sessions are persisted for 24h. Prefer them so
        // a stale native session cannot replace the active collaborator login.
        const collaborator = getStoredCollaborator();
        if (collaborator) {
          sessionStorage.setItem('collaborator', JSON.stringify(collaborator));
          const storedToken = getStoredSessionToken();
          if (storedToken) sessionStorage.setItem('collaborator_session_token', storedToken);
          setUser(collaborator);
          setIsAuthenticated(true);
          return;
        }

        // Supabase Auth remains available for native email-based accounts.
        if (supabase) {
          try {
            const { data, error } = await withTimeout(supabase.auth.getSession(), AUTH_SESSION_TIMEOUT_MS);
            if (!error && applySession(data.session)) return;
          } catch (error) {
            // A sessão nativa é opcional para o login de colaboradores. Se a
            // rede ou o serviço estiver indisponível, a tela de login deve
            // continuar acessível em vez de permanecer no carregamento.
            console.warn('[Auth] Não foi possível verificar a sessão nativa:', error?.message);
          }
        }

        // Salva a rota atual para redirecionar após login
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath && currentPath !== '/' && currentPath !== '/Dashboard') {
          localStorage.setItem('redirectAfterLogin', currentPath);
        }
        setAuthError({ type: 'auth_required' });
      } catch (error) {
        setAuthError({ type: 'auth_required' });
      } finally {
        setIsLoadingAuth(false);
        setIsLoadingPublicSettings(false);
      }
    };

    checkAuth().finally(() => {
      if (!mounted) return;
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    });

    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        applySession(session);
      } else if (!getStoredCollaborator()) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required' });
      }
    }).data.subscription;

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const navigateToLogin = () => {
    setUser(null);
    clearStoredCollaboratorSession();
    setIsAuthenticated(false);
    supabase?.auth.signOut();
    // Reload para voltar à tela de login
    window.location.href = '/';
  };

  const loginSuccess = (collaborator) => {
    setAuthError(null);
    setUser(collaborator);
    setIsAuthenticated(true);
    // Redireciona para a rota salva antes do login, se houver
    const redirectTo = localStorage.getItem('redirectAfterLogin');
    if (redirectTo) {
      localStorage.removeItem('redirectAfterLogin');
      window.location.href = redirectTo;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      navigateToLogin,
      setUser: loginSuccess
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
