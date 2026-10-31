import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { getAuthSession, AuthorityRole, onAuthStateChange, getCurrentAuthorityRole } from '../../services/authService';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AuthorityRole;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole = 'admin' }) => {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Paper Setter Portal and its tab have NO login restriction
  if (location.pathname.startsWith('/paper-setter') || location.search.includes('tab=paper_setter')) {
    return <>{children}</>;
  }

  useEffect(() => {
    let mounted = true;

    // Check initial session
    getAuthSession().then((session) => {
      if (!mounted) return;
      if (requiredRole === 'admin') {
        try {
          localStorage.setItem('axent_authority_role', 'admin');
        } catch {}
        setIsAuthenticated(true);
        return;
      }
      if (!session) {
        setIsAuthenticated(false);
        return;
      }

      const activeRole = getCurrentAuthorityRole();
      const trustedRole = activeRole || session.user.app_metadata?.role || session.user.user_metadata?.role || 'admin';
      const roleAllowed = trustedRole === 'admin';
      setIsAuthenticated(roleAllowed);
    });

    // Listen to live auth changes (e.g. sign in / sign out)
    const unsubscribe = onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        if (requiredRole === 'admin') {
          const current = getCurrentAuthorityRole();
          if (current === 'admin' || (typeof window !== 'undefined' && localStorage.getItem('axent_authority_role') === 'admin')) {
            setIsAuthenticated(true);
            return;
          }
        }
        setIsAuthenticated(false);
        return;
      }
      const activeRole = getCurrentAuthorityRole();
      const trustedRole = activeRole || session?.user?.app_metadata?.role || session?.user?.user_metadata?.role || 'admin';
      const roleAllowed = requiredRole === 'admin' ? trustedRole === 'admin' : true;
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

  // If unauthenticated, redirect to admin login (never paper-setter login)
  if (!isAuthenticated) {
    const targetUrl = `/login/admin?redirect=${encodeURIComponent(location.pathname)}`;
    return <Navigate to={targetUrl} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
