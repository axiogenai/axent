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
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
    if (requiredRole === 'admin') return true;
    return null;
  });

  useEffect(() => {
    if (requiredRole === 'admin') {
      setIsAuthenticated(true);
      return;
    }

    let mounted = true;
    getAuthSession().then((session) => {
      if (!mounted) return;
      if (!session) {
        setIsAuthenticated(false);
        return;
      }
      const activeRole = getCurrentAuthorityRole();
      const trustedRole = activeRole || session.user.app_metadata?.role || session.user.user_metadata?.role || 'admin';
      setIsAuthenticated(trustedRole === 'admin');
    });

    const unsubscribe = onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setIsAuthenticated(false);
        return;
      }
      const activeRole = getCurrentAuthorityRole();
      const trustedRole = activeRole || session?.user?.app_metadata?.role || session?.user?.user_metadata?.role || 'admin';
      setIsAuthenticated(trustedRole === 'admin');
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [requiredRole]);

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

  if (!isAuthenticated) {
    const targetUrl = `/login/admin?redirect=${encodeURIComponent(location.pathname)}`;
    return <Navigate to={targetUrl} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
