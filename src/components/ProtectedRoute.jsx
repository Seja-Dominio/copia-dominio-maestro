import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const [state, setState] = useState('loading'); // loading | authenticated | unauthenticated | not_registered

  useEffect(() => {
    base44.auth.isAuthenticated()
      .then(authed => {
        if (authed) {
          setState('authenticated');
        } else {
          setState('unauthenticated');
        }
      })
      .catch(err => {
        if (err?.data?.extra_data?.reason === 'user_not_registered') {
          setState('not_registered');
        } else {
          setState('unauthenticated');
        }
      });
  }, []);

  if (state === 'loading') return fallback;
  if (state === 'not_registered') return <UserNotRegisteredError />;
  if (state === 'unauthenticated') return unauthenticatedElement;

  return <Outlet />;
}