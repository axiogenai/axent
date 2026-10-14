import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { getAuthSession, AuthorityRole, onAuthStateChange } from '../../services/authService';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AuthorityRole;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole = 'paper_setter' }) => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    // Check initial session
    getAuthSession().then((session) => {
      if (mounted) {
        setIsAuthenticated(Boolean(session));
      }
    });

    // Listen to live auth changes (e.g. sign in / sign out)
    const unsubscribe = onAuthStateChange((_event, session) => {
      if (mounted) {
        setIsAuthenticated(Boolean(session));
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Loading state while verifying credentials
  if (isAuthenticated === null) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 52px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-main)',
          gap: '12px'
        }}
      >
        <RefreshCw size={24} className="spinner-icon" color="var(--accent)" />
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
          Verifying Authority Credentials...
        </span>
      </div>
    );
  }

  // If unauthenticated, redirect to login with query params
  if (!isAuthenticated) {
    const targetUrl = `/login?redirect=${encodeURIComponent(location.pathname)}&role=${requiredRole}`;
    return <Navigate to={targetUrl} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
