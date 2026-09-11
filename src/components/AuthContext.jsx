import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

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
        // Supabase Auth is the primary session source. The collaborator token
        // remains a compatibility fallback for existing migrated accounts.
        if (supabase) {
          const { data, error } = await supabase.auth.getSession();
          if (!error && applySession(data.session)) return;
        }
        const collaborator = sessionStorage.getItem('collaborator');
        if (collaborator) {
          setUser(JSON.parse(collaborator));
          setIsAuthenticated(true);
        } else {
          // Salva a rota atual para redirecionar após login
          const currentPath = window.location.pathname + window.location.search;
          if (currentPath && currentPath !== '/' && currentPath !== '/Dashboard') {
            localStorage.setItem('redirectAfterLogin', currentPath);
          }
          setAuthError({ type: 'auth_required' });
        }
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
      } else if (!sessionStorage.getItem('collaborator')) {
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
    sessionStorage.removeItem('collaborator');
    sessionStorage.removeItem('collaborator_session_token');
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
