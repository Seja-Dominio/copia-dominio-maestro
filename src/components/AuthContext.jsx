import React, { createContext, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Verifica autenticação ao montar
  useEffect(() => {
    const checkAuth = () => {
      try {
        const collaborator = sessionStorage.getItem('collaborator');
        if (collaborator) {
          setUser(JSON.parse(collaborator));
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

    checkAuth();
  }, []);

  const navigateToLogin = () => {
    setUser(null);
    sessionStorage.removeItem('collaborator');
    // Reload para voltar à tela de login
    window.location.href = '/';
  };

  const loginSuccess = (collaborator) => {
    setAuthError(null);
    setUser(collaborator);
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