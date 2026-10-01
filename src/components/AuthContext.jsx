import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearStoredCollaboratorSession, getStoredCollaborator } from '@/api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    try {
      const collaborator = getStoredCollaborator();
      if (collaborator) {
        sessionStorage.setItem('collaborator', JSON.stringify(collaborator));
        setUser(collaborator);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath && currentPath !== '/' && currentPath !== '/Dashboard') {
          localStorage.setItem('redirectAfterLogin', currentPath);
        }
        setAuthError({ type: 'auth_required' });
      }
    } catch {
      setAuthError({ type: 'auth_required' });
    } finally {
      if (mounted) {
        setIsLoadingAuth(false);
        setIsLoadingPublicSettings(false);
      }
    }

    return () => {
      mounted = false;
    };
  }, []);

  const navigateToLogin = () => {
    setUser(null);
    clearStoredCollaboratorSession();
    setIsAuthenticated(false);
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
