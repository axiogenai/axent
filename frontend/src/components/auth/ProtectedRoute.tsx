import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { getAuthSession, AuthorityRole, onAuthStateChange, getCurrentAuthorityRole } from '../../services/authService';

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

      const activeRole = getCurrentAuthorityRole();
      const trustedRole = activeRole || session.user.app_metadata?.role || session.user.user_metadata?.role || 'paper_setter';
      const roleAllowed = requiredRole === 'super_admin'
        ? trustedRole === 'super_admin'
        : (requiredRole === 'admin'
          ? (trustedRole === 'admin' || trustedRole === 'super_admin' || trustedRole === 'paper_setter')
          : (trustedRole === 'paper_setter' || trustedRole === 'admin' || trustedRole === 'super_admin'));
      setIsAuthenticated(roleAllowed);
    });

    // Listen to live auth changes (e.g. sign in / sign out)
    const unsubscribe = onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) {
        setIsAuthenticated(false);
        return;
      }
      const activeRole = getCurrentAuthorityRole();
      const trustedRole = activeRole || session?.user?.app_metadata?.role || session?.user?.user_metadata?.role || 'paper_setter';
      const roleAllowed = requiredRole === 'super_admin'
        ? trustedRole === 'super_admin'
        : (requiredRole === 'admin'
          ? (trustedRole === 'admin' || trustedRole === 'super_admin' || trustedRole === 'paper_setter')
          : (trustedRole === 'paper_setter' || trustedRole === 'admin' || trustedRole === 'super_admin'));
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

  // If unauthenticated or unauthorized, redirect safely
  if (!isAuthenticated) {
    const targetUrl = requiredRole === 'admin'
      ? `/login/admin?redirect=${encodeURIComponent(location.pathname)}`
      : `/login/paper-setter?redirect=${encodeURIComponent(location.pathname)}`;
    return <Navigate to={targetUrl} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
