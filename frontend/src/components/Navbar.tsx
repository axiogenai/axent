import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Hexagon,
  Sun,
  Moon,
  Layers,
  Code2,
  FileText,
  ShieldAlert,
  ListChecks,
  ExternalLink,
  LogOut,
  LucideIcon
} from 'lucide-react';
import { ThemeMode } from '../types/dna';
import {
  signOut,
  getCurrentAuthorityRole,
  isAuthorityAdmin,
  onAuthStateChange,
  AuthorityRole
} from '../services/authService';
import { ContinuousTabs } from './watermelon-ui';

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings?: () => void;
  isRunning?: boolean;
}

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeColor?: 'danger' | 'warning' | 'neutral';
}

function getActiveExamMode(): 'MCQ' | 'CODING' {
  if (typeof window === 'undefined') return 'CODING';
  const explicit = localStorage.getItem('codedna_active_exam_mode');
  if (explicit === 'MCQ') return 'MCQ';
  if (explicit === 'CODING') return 'CODING';

  try {
    const raw = localStorage.getItem('codedna_student_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.examMode === 'MCQ' || parsed.examType === 'Multiple Choice Question (MCQ) Examination') {
        return 'MCQ';
      }
    }
  } catch {
    // Ignore
  }
  return 'CODING';
}

export const Navbar: React.FC<NavbarProps> = ({
  theme,
  onToggleTheme,
  onOpenSettings,
  isRunning = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [examMode, setExamMode] = useState<'MCQ' | 'CODING'>(() => getActiveExamMode());
  const [authorityRole, setAuthorityRole] = useState<AuthorityRole | null>(() => getCurrentAuthorityRole());
  const isAdmin = authorityRole === 'admin' || isAuthorityAdmin();

  // Listen to profile/mode and authority role changes in storage/auth
  useEffect(() => {
    const checkState = () => {
      setExamMode(getActiveExamMode());
      setAuthorityRole(getCurrentAuthorityRole());
    };
    checkState();
    const unsub = onAuthStateChange(() => checkState());
    window.addEventListener('storage', checkState);
    return () => {
      unsub();
      window.removeEventListener('storage', checkState);
    };
  }, [location.pathname]);

  const isLandingRoute = location.pathname === '/';
  const isLoginRoute = location.pathname.startsWith('/login');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isPaperSetterRoute = location.pathname.startsWith('/paper-setter');
  const isMcqRoute = location.pathname.startsWith('/mcq');

  // Determine which navigation tabs to display based on Role and Registered Exam Type
  let activeNavItems: NavItem[] = [];

  if (isLandingRoute) {
    activeNavItems = [
      { path: '/mcq', label: 'Exam Hall', icon: ListChecks }
    ];
  } else if (isLoginRoute) {
    // Authority Gateway / Login — No student tabs!
    activeNavItems = [];
  } else if (isAdminRoute) {
    // Admin CCTV Surveillance — Always expose both Admin CCTV & Paper Setter Portal
    activeNavItems = [
      { path: '/admin', label: 'CCTV Live Proctoring', icon: ShieldAlert, badge: 'PROCTOR', badgeColor: 'danger' },
      { path: '/paper-setter', label: 'Paper Setter Portal', icon: Layers }
    ];
  } else if (isPaperSetterRoute) {
    // If the authority logged in with Admin credentials, allow full bidirectional switching
    // But if logged in with Paper Setter credentials, DO NOT show the Admin CCTV portal!
    if (isAdmin) {
      activeNavItems = [
        { path: '/admin', label: 'CCTV Live Proctoring', icon: ShieldAlert, badge: 'PROCTOR', badgeColor: 'danger' },
        { path: '/paper-setter', label: 'Paper Setter Portal', icon: Layers }
      ];
    } else {
      activeNavItems = [
        { path: '/paper-setter', label: 'Paper Setter Portal', icon: Layers }
      ];
    }
  } else if (isMcqRoute || examMode === 'MCQ') {
    // Registered MCQ Examination — Clean view, no redundant pill in navbar
    activeNavItems = [];
  } else {
    activeNavItems = [];
  }

  const activeId = activeNavItems.find((item) => location.pathname.startsWith(item.path))?.path ?? location.pathname;

  return (
    <header
      className="no-print"
      style={{
        height: '52px',
        minHeight: '52px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
        zIndex: 50,
        userSelect: 'none'
      }}
    >
      {/* ── Brand Title ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer'
        }}
        onClick={() => {
          if (isRunning) return;
          navigate('/');
        }}
        title="Axent Platform Home"
      >
        <img
          src={theme === 'dark' ? '/axent-logo.png' : '/axent-lightmode.png'}
          alt="Axent"
          style={{
            height: '24px',
            width: 'auto',
            display: 'block',
            objectFit: 'contain'
          }}
        />
      </div>

      {/* ── Navigation Tabs (Filtered strictly by Role and Registered Exam Type) ── */}
      {activeNavItems.length > 1 ? (
        <div style={{ overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '60vw', display: 'flex', alignItems: 'center' }}>
          <ContinuousTabs
            layoutId="navbar-primary-tabs"
            size="md"
            activeId={activeId}
            onChange={(path) => navigate(path)}
            tabs={activeNavItems.map(({ path, label, icon: Icon, badge, badgeColor }) => ({
              id: path,
              label,
              icon: <Icon size={13} />,
              badge,
              badgeTone: badgeColor === 'danger' ? 'danger' : badgeColor === 'warning' ? 'warning' : 'neutral'
            }))}
          />
        </div>
      ) : null}

      {/* ── Controls & Mode ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* If on Login route, show button to return to Candidate Examination */}
        {isLoginRoute ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/mcq')}
            title="Candidate Examination Portal"
            style={{
              height: '30px',
              padding: '0 10px',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)'
            }}
          >
            <ExternalLink size={12} />
            <span>Candidate Portal</span>
          </button>
        ) : null}

        {/* If in Paper Setter AND user has Admin privileges, provide 1-click switch back to Admin CCTV */}
        {isPaperSetterRoute && isAdmin ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/admin')}
            title="Switch to Chief Proctor CCTV Live Surveillance"
            style={{
              height: '30px',
              padding: '0 10px',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#ef4444'
            }}
          >
            <ShieldAlert size={13} color="#ef4444" />
            <span>Admin CCTV</span>
          </button>
        ) : null}

        {/* If in Admin, provide 1-click switch to Paper Setter */}
        {isAdminRoute ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/paper-setter')}
            title="Open Paper Setter & Examination Builder Portal"
            style={{
              height: '30px',
              padding: '0 10px',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)'
            }}
          >
            <Layers size={13} />
            <span>Paper Setter</span>
          </button>
        ) : null}

        {/* Authority Sign Out */}
        {(isAdminRoute || isPaperSetterRoute) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
            title="Sign out of Authority Portal"
            style={{
              height: '28px',
              padding: '0 10px',
              gap: '5px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)'
            }}
          >
            <LogOut size={12} />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Daylight Slate' : 'Matte Black'} Theme`}
          style={{
            width: '32px',
            height: '32px',
            padding: 0,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)'
          }}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
};
