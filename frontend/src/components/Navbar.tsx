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
  LucideIcon,
  Menu,
  X,
  Download,
  Zap,
  RefreshCw,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { triggerInstallPrompt } from './ui/PWAInstallPrompt';
import { ThemeMode } from '../types/dna';
import {
  signOut,
  getCurrentAuthorityRole,
  isAuthorityAdmin,
  onAuthStateChange,
  AuthorityRole
} from '../services/authService';
import { ContinuousTabs } from './watermelon-ui';
import { playSound } from '../utils/sounds';
import { broadcastRemoteHardRefresh } from '../services/remoteControlService';
import { wipeEntireDatabaseFromCloud } from '../services/mcqService';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const isAdmin = authorityRole === 'admin' || isAuthorityAdmin();

  // Listen to Admin Sidebar mobile state
  useEffect(() => {
    const handleAdminSidebar = (e: any) => {
      setAdminSidebarOpen(Boolean(e.detail?.isOpen));
    };
    window.addEventListener('admin-sidebar-state', handleAdminSidebar);
    return () => window.removeEventListener('admin-sidebar-state', handleAdminSidebar);
  }, []);

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

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const isCodeSparkRoute = location.pathname.startsWith('/code-spark') || location.pathname.startsWith('/codespark');
  const isLandingRoute = location.pathname === '/';
  const isLoginRoute = location.pathname.startsWith('/login');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  
  const handleGlobalWipeDatabase = async () => {
    if (!window.confirm('[CRITICAL DATABASE WIPE]\n\nAre you sure you want to completely WIPE THE ENTIRE DATABASE?\n\nThis will permanently delete from cloud:\n• All exams & question banks\n• All student attempts, scores & answer sheets\n• All workstations & live sessions\n• All Round 2 coding submissions & leaderboards\n\nThis action cannot be undone. Click OK to wipe everything.')) {
      return;
    }
    try {
      await wipeEntireDatabaseFromCloud();
      try {
        await broadcastRemoteHardRefresh();
      } catch {}
      alert('DATABASE 100% WIPED: All exams, questions, attempts, and stations have been permanently deleted from Supabase cloud.');
      window.location.reload();
    } catch (err: any) {
      alert('Failed to wipe database: ' + (err?.message || 'Network error'));
    }
  };

  const handleRemoteRefreshAll = async () => {
    if (!window.confirm('REMOTE HARD REFRESH: Remotely reload every connected candidate workstation and mobile device across all labs?')) {
      return;
    }
    setIsRefreshingAll(true);
    try {
      await broadcastRemoteHardRefresh();
      alert('Remote hard refresh signal dispatched to all devices via Supabase.');
    } catch (err: any) {
      alert(`Failed to send remote refresh: ${err.message || err}`);
    } finally {
      setIsRefreshingAll(false);
    }
  };

  const isPaperSetterRoute = location.pathname.startsWith('/paper-setter');
  const isMcqRoute = location.pathname.startsWith('/mcq');

  // Determine which navigation tabs to display based on Role and Registered Exam Type
  let activeNavItems: NavItem[] = [];

  if (isLandingRoute) {
    activeNavItems = [
      { path: '/code-spark', label: 'Code Spark (3 Nov)', icon: Zap, badge: 'CONTEST' },
      { path: '/mcq', label: 'Exam Hall', icon: ListChecks }
    ];
  } else if (isLoginRoute) {
    // Authority Gateway / Login — No student tabs!
    activeNavItems = [];
  } else if (isAdminRoute || isPaperSetterRoute) {
    // Authority routes — no center tabs; navigation is via right-side buttons only
    activeNavItems = [];
  } else if (isMcqRoute || examMode === 'MCQ') {
    activeNavItems = [];
  } else {
    activeNavItems = [];
  }

  const activeId = activeNavItems.find((item) => location.pathname.startsWith(item.path))?.path ?? location.pathname;

  return (
    <>
      <header
        className="no-print"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          width: '100%',
          height: '52px',
          minHeight: '52px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          flexShrink: 0,
          zIndex: 1000,
          userSelect: 'none',
          boxSizing: 'border-box'
        }}
      >
        {/* ── Brand Title ── */}
        <div
          onClick={() => {
            if (isRunning || isMcqRoute) return;
            navigate('/');
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: isMcqRoute ? 'default' : 'pointer'
          }}
          title={isMcqRoute ? "Candidate Examination Hall" : "Axent Platform Home"}
        >
          <div style={{ display: 'flex', alignItems: 'center', height: '24px' }}>
            <img
              src="/axent-lightmode.png"
              alt="Axent"
              className="axent-theme-logo-light"
              style={{
                height: '24px',
                width: 'auto',
                display: 'block',
                objectFit: 'contain'
              }}
            />
            <img
              src="/axent-logo.png"
              alt="Axent"
              className="axent-theme-logo-dark"
              style={{
                height: '24px',
                width: 'auto',
                display: 'block',
                objectFit: 'contain'
              }}
            />
          </div>
        </div>

        {/* ── Navigation Tabs (Desktop only: Filtered strictly by Role) ── */}
        {activeNavItems.length > 1 ? (
          <div className="hidden md:flex" style={{ overflowX: 'auto', scrollbarWidth: 'none', maxWidth: '60vw', alignItems: 'center' }}>
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

        {/* ── Desktop Controls & Mode ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Desktop Authority Links */}
          <div className="hidden md:flex items-center gap-2">
            {/* If on Login route, show button to return to Candidate Examination */}
            {isLoginRoute && (
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
            )}

            {/* If in Paper Setter, provide 1-click switch back to Admin */}
            {isPaperSetterRoute && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate('/admin')}
                title="Return to Chief Proctor Admin Portal"
                style={{
                  height: '30px',
                  padding: '0 10px',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)'
                }}
              >
                <ArrowLeft size={13} />
                <span>Admin Portal</span>
              </button>
            )}

                        {/* Remote Hard Refresh All Devices Trigger */}
            {isAdminRoute && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleRemoteRefreshAll}
                disabled={isRefreshingAll}
                title="Force instant remote hard refresh across all student workstations & devices"
                style={{
                  height: '30px',
                  padding: '0 10px',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: '#f59e0b',
                  cursor: isRefreshingAll ? 'not-allowed' : 'pointer'
                }}
              >
                <RefreshCw size={12} className={isRefreshingAll ? 'animate-spin' : ''} />
                <span>{isRefreshingAll ? 'Refreshing...' : 'Remote Refresh All'}</span>
              </button>
            )}
            {/* If in Admin, provide 1-click Clear Database button */}
            {isAdminRoute && (
              <button
                className="btn btn-sm"
                onClick={handleGlobalWipeDatabase}
                title="Permanently wipe all exams, questions, attempts, and stations from database"
                style={{
                  height: '30px',
                  padding: '0 10px',
                  gap: '5px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                <Trash2 size={12} />
                <span>Clear Database</span>
              </button>
            )}




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
          </div>

          {/* Standalone Install App Trigger */}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => triggerInstallPrompt()}
            title="Install Axent Standalone App"
            style={{
              height: '32px',
              padding: '0 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              flexShrink: 0
            }}
          >
            <Download size={13} />
            <span className="hidden sm:inline">Install App</span>
          </button>

          {/* Theme Toggle (Always Accessible on all screen sizes) */}
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
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Mobile Hamburger Menu Toggle (Screens < 768px, non-mcq only) */}
          {!isMcqRoute && (() => {
            const isMenuOpen = isAdminRoute ? adminSidebarOpen : mobileMenuOpen;
            return (
              <button
                className="md:hidden btn btn-ghost btn-sm"
                onClick={() => {
                  if (isAdminRoute) {
                    window.dispatchEvent(new CustomEvent('toggle-admin-sidebar'));
                  } else {
                    setMobileMenuOpen((prev) => !prev);
                  }
                }}
                aria-label="Toggle Navigation Drawer"
                style={{
                  width: '32px',
                  height: '32px',
                  padding: 0,
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: isMenuOpen ? 'var(--accent)' : 'var(--bg-surface)',
                  color: isMenuOpen ? 'var(--accent-contrast)' : 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {isMenuOpen ? <X size={15} /> : <Menu size={15} />}
              </button>
            );
          })()}
        </div>
      </header>

      {/* ── Mobile Navigation Drawer Overlay (< 768px, non-admin only) ── */}
      {mobileMenuOpen && !isAdminRoute && !isMcqRoute && (
        <div
          className="md:hidden fixed inset-x-0 top-[52px] bottom-0 z-40 bg-[var(--bg-main)]/95 backdrop-blur-md flex flex-col p-5 overflow-y-auto"
          style={{
            borderBottom: '1px solid var(--border)',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          <div className="flex flex-col gap-2 mb-6">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Navigation &amp; Controls
            </span>

            {/* Exam Hall Link */}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/mcq');
              }}
              className={`w-full flex items-center justify-between p-3.5 rounded-lg border text-sm font-semibold text-left transition-colors ${
                isMcqRoute
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <ListChecks size={16} className="text-[var(--accent)]" />
                <span>Candidate Exam Hall</span>
              </div>
              <ExternalLink size={14} className="text-[var(--text-muted)]" />
            </button>

            {/* Coding Workspace Link */}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/workspace');
              }}
              className={`w-full flex items-center justify-between p-3.5 rounded-lg border text-sm font-semibold text-left transition-colors ${
                location.pathname === '/workspace'
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Code2 size={16} className="text-[var(--accent)]" />
                <span>Coding Practical Workspace</span>
              </div>
              <ExternalLink size={14} className="text-[var(--text-muted)]" />
            </button>

            {/* Admin CCTV Portal */}
            {(isAdmin || isAdminRoute || isPaperSetterRoute) && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/admin');
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-lg border text-sm font-semibold text-left transition-colors ${
                  isAdminRoute
                    ? 'border-red-500/40 bg-red-500/10 text-red-500'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <ShieldAlert size={16} className={isAdminRoute ? 'text-red-500' : 'text-[var(--accent)]'} />
                  <span>Admin CCTV Live Proctoring</span>
                </div>
                {isAdminRoute && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                    Active
                  </span>
                )}
              </button>
            )}

            {/* Paper Setter Tab */}
            {(isAdmin || isAdminRoute) && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate('/admin?tab=paper_setter');
                  playSound('click');
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-lg border text-sm font-semibold text-left transition-colors ${
                  location.search.includes('tab=paper_setter')
                    ? 'border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Layers size={16} className="text-[var(--accent)]" />
                  <span>Paper Setter &amp; Question Matrix</span>
                </div>
                {location.search.includes('tab=paper_setter') && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border)]">
                    Active
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Theme & Session Utilities in Mobile Drawer */}
          <div className="mt-auto pt-4 border-t border-[var(--border)] flex flex-col gap-3">
            <button
              onClick={onToggleTheme}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-primary)]"
            >
              <div className="flex items-center gap-2">
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                <span>Active Theme: {theme === 'dark' ? 'Matte Obsidian' : 'Daylight Slate'}</span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">Toggle</span>
            </button>

            {(isAdminRoute || isPaperSetterRoute) && (
              <button
                onClick={async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                }}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-bold"
              >
                <LogOut size={14} />
                <span>Sign Out of Authority Session</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
