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
      if (!mounted) return;
      if (!session) {
        setIsAuthenticated(false);
        return;
      }

      // app_metadata is managed by trusted Supabase administrators; user_metadata
      // and localStorage are user-editable and must not grant privileged roles.
      const trustedRole = session.user.app_metadata?.role;
      const roleAllowed = requiredRole !== 'admin' || trustedRole === 'admin';
      setIsAuthenticated(roleAllowed);
    });

    // Listen to live auth changes (e.g. sign in / sign out)
    const unsubscribe = onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const trustedRole = session?.user?.app_metadata?.role;
      const roleAllowed = Boolean(session) && (requiredRole !== 'admin' || trustedRole === 'admin');
      setIsAuthenticated(roleAllowed);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [requiredRole]);

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

  // If unauthenticated, redirect to dedicated authority login portal
  if (!isAuthenticated) {
    const targetUrl = requiredRole === 'admin'
      ? `/login/admin?redirect=${encodeURIComponent(location.pathname)}`
      : `/login/paper-setter?redirect=${encodeURIComponent(location.pathname)}`;
    return <Navigate to={targetUrl} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
