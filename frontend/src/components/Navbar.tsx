import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Hexagon,
  Sun,
  Moon,
  Layers,
  Settings,
  Code2,
  FileText,
  ShieldAlert,
  ListChecks,
  ExternalLink,
  LogOut,
  LucideIcon
} from 'lucide-react';
import { ThemeMode } from '../types/dna';
import { signOut } from '../services/authService';
import { ContinuousTabs } from './watermelon-ui';

interface NavbarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
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

  // Listen to profile/mode changes in local storage across tabs
  useEffect(() => {
    const checkMode = () => {
      setExamMode(getActiveExamMode());
    };
    checkMode();
    window.addEventListener('storage', checkMode);
    return () => window.removeEventListener('storage', checkMode);
  }, [location.pathname]);

  const isLoginRoute = location.pathname.startsWith('/login');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isPaperSetterRoute = location.pathname.startsWith('/paper-setter');
  const isMcqRoute = location.pathname.startsWith('/mcq');

  // Determine which navigation tabs to display based on Role and Registered Exam Type
  let activeNavItems: NavItem[] = [];

  if (isLoginRoute) {
    // Authority Gateway / Login — No student tabs!
    activeNavItems = [];
  } else if (isPaperSetterRoute) {
    // Paper setter — no admin links, no CCTV, no ADMIN badge
    activeNavItems = [
      { path: '/paper-setter', label: 'Paper Setter', icon: Layers }
    ];
  } else if (isAdminRoute) {
    // Invigilator & Examination Administration Navigation
    activeNavItems = [
      { path: '/admin', label: 'CCTV Live Proctoring', icon: ShieldAlert, badge: 'PROCTOR', badgeColor: 'danger' },
      { path: '/paper-setter', label: 'Paper Setter Portal', icon: Layers }
    ];
  } else if (isMcqRoute || examMode === 'MCQ') {
    // Registered MCQ Examination — Show ONLY MCQ
    activeNavItems = [
      { path: '/mcq', label: 'MCQ Examination', icon: ListChecks, badge: 'EXAM', badgeColor: 'neutral' }
    ];
  } else {
    // Registered Coding Examination — Show ONLY Code & Test (and Report)
    activeNavItems = [
      { path: '/workspace', label: 'Code & Test', icon: Code2 },
      { path: '/report', label: 'Report & Dossier', icon: FileText }
    ];
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
          if (isLoginRoute) navigate('/login');
          else if (isPaperSetterRoute) navigate('/paper-setter');
          else if (isAdminRoute) navigate('/admin');
          else if (isMcqRoute || examMode === 'MCQ') navigate('/mcq');
          else navigate('/workspace');
        }}
      >
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <Hexagon size={16} color="var(--accent)" />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Ax<span style={{ color: 'var(--accent)' }}>ent</span>
          </span>
          <span
            style={{
              fontSize: '10.5px',
              color: 'var(--text-muted)',
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: 'var(--radius-xs)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase'
            }}
          >
            {isLoginRoute
              ? 'Authority Gateway'
              : isPaperSetterRoute
              ? 'Paper Setter'
              : isAdminRoute
              ? 'Invigilator Console'
              : (isMcqRoute || examMode === 'MCQ')
              ? 'MCQ Examination'
              : 'Coding Practical'}
          </span>
        </div>
      </div>

      {/* ── Navigation Tabs (Filtered strictly by Role and Registered Exam Type) ── */}
      {activeNavItems.length > 1 ? (
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
      ) : activeNavItems.length === 1 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-primary)'
          }}
        >
          {React.createElement(activeNavItems[0].icon, { size: 13, color: 'var(--text-secondary)' })}
          <span>{activeNavItems[0].label}</span>
          {activeNavItems[0].badge && (
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 'var(--radius-xs)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                marginLeft: '4px'
              }}
            >
              {activeNavItems[0].badge}
            </span>
          )}
        </div>
      ) : null}

      {/* ── Controls & Mode ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* If on Login route, show button to return to Candidate Examination */}
        {isLoginRoute ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(examMode === 'MCQ' ? '/mcq' : '/workspace')}
            title="Candidate Examination Portal"
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
            <ExternalLink size={12} />
            <span>Candidate Portal</span>
          </button>
        ) : null}

        {/* If in Admin, provide 1-click switch to Candidate View */}
        {isAdminRoute ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(examMode === 'MCQ' ? '/mcq' : '/workspace')}
            title="Open Candidate Examination View"
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
            <ExternalLink size={12} />
            <span>Candidate Terminal</span>
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
            <span>Sign Out</span>
          </button>
        )}

        {/* Settings Button - available to authorities */}
        {(isAdminRoute || isPaperSetterRoute) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onOpenSettings}
            title="System & AI Settings"
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)'
            }}
          >
            <Settings size={14} />
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
