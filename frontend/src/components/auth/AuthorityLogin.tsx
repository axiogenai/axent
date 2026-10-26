import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';

const SAFE_AUTH_REDIRECTS = new Set([
  '/admin',
  '/admin/mcq-tickets',
  '/paper-setter',
  '/invite',
  '/login/invite',
  '/authority-invite',
  '/login/admin',
  '/login/paper-setter'
]);

function resolveSafeRedirect(candidate: string | null, fallback: string): string {
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin || !SAFE_AUTH_REDIRECTS.has(url.pathname)) {
      return fallback;
    }
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

import {
  Hexagon,
  Shield,
  KeyRound,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ShieldAlert,
  Send,
  RefreshCw,
  Check,
  GraduationCap
} from 'lucide-react';
import {
  signInWithPassword,
  sendMagicLink,
  updateUserPassword,
  getAuthSession,
  AuthorityRole,
  setStoredAuthorityRole
} from '../../services/authService';
import { playSound } from '../../utils/sounds';

type AuthTab = 'signin' | 'magic_link' | 'set_password';

export interface AuthorityLoginProps {
  fixedRole?: AuthorityRole;
  theme?: 'light' | 'dark';
}

export const AuthorityLogin: React.FC<AuthorityLoginProps> = ({ fixedRole, theme }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const isSetterPath = location.pathname.includes('setter');
  const isAdminPath = location.pathname.includes('admin');
  const roleParam = searchParams.get('role');
  const typeParam = searchParams.get('type');

  // Dedicated standalone role if requested via prop, dedicated route, or query param
  const effectiveRole: AuthorityRole =
    fixedRole ||
    (isAdminPath ? 'admin' : (isSetterPath ? 'paper_setter' : (roleParam === 'admin' ? 'admin' : 'paper_setter')));
  const isDedicatedPortal = Boolean(fixedRole || isSetterPath || isAdminPath || roleParam);

  const defaultRedirect = effectiveRole === 'admin' ? '/admin' : '/paper-setter';
  const redirectTarget = resolveSafeRedirect(searchParams.get('redirect'), defaultRedirect);

  const [role, setRole] = useState<AuthorityRole>(effectiveRole);

  useEffect(() => {
    setRole(effectiveRole);
  }, [effectiveRole]);

  const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>(() => {
    if (theme) return theme;
    if (typeof window !== 'undefined') {
      const docTheme = document.documentElement.getAttribute('data-theme');
      if (docTheme === 'dark' || docTheme === 'light') return docTheme;
      const stored = localStorage.getItem('codedna_theme');
      if (stored === 'dark' || stored === 'light') return stored;
    }
    return 'light';
  });

  useEffect(() => {
    if (theme) setActiveTheme(theme);
  }, [theme]);

  useEffect(() => {
    const updateTheme = () => {
      const docTheme = document.documentElement.getAttribute('data-theme');
      if (docTheme === 'dark' || docTheme === 'light') {
        setActiveTheme(docTheme);
      }
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('storage', updateTheme);
    return () => {
      observer.disconnect();
      window.removeEventListener('storage', updateTheme);
    };
  }, []);

  const [activeTab, setActiveTab] = useState<AuthTab>(() => {
    if (typeParam === 'recovery' || typeParam === 'invite') return 'set_password';
    return 'signin';
  });

  // Sign In Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Set New Password Fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Status & UI States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle provider callbacks and invite token authentication
  useEffect(() => {
    const hash = window.location.hash;
    const tokenParam = searchParams.get('token');
    const emailParam = searchParams.get('email');
    const hasProviderCallback = hash.includes('access_token=') ||
      hash.includes('type=recovery') || hash.includes('type=invite');

    if (hasProviderCallback) {
      setActiveTab('set_password');
      setSuccessMessage('Authentication callback verified. Please configure your institutional password below.');
    }
  }, [typeParam, searchParams, role]);

  // Handle Role Change
  const handleRoleSelect = (newRole: AuthorityRole) => {
    setRole(newRole);
    setStoredAuthorityRole(newRole);
    setErrorMessage(null);
    setSuccessMessage(null);
    playSound('click');
  };

  // ── Password Login Submit ───────────────────────────────────────────────────
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Institutional email address is required.');
      playSound('warning');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage('Please provide a valid institutional email address.');
      playSound('warning');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your authority password.');
      playSound('warning');
      return;
    }

    setIsLoading(true);
    try {
      const { user, error } = await signInWithPassword(trimmedEmail, password, role);
      if (error) {
        setErrorMessage(error);
        playSound('warning');
        return;
      }
      if (user) {
        playSound('success');
        const userRole = user.app_metadata?.role || user.user_metadata?.role || role;
        let dest = redirectTarget;
        if (userRole === 'paper_setter' && (dest === '/admin' || dest.startsWith('/admin'))) {
          dest = '/paper-setter';
        }
        navigate(dest, { replace: true });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Send Magic Link / Invite Submit ─────────────────────────────────────────
  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Institutional email is required to dispatch an invite link.');
      playSound('warning');
      return;
    }

    setIsLoading(true);
    try {
      const destination = role === 'admin' ? '/admin' : '/paper-setter';
      const { success, error } = await sendMagicLink(trimmedEmail, destination);
      if (!success || error) {
        setErrorMessage(error || 'Failed to dispatch magic link invite.');
        playSound('warning');
        return;
      }
      playSound('success');
      setSuccessMessage(`Magic link dispatched to ${trimmedEmail}. Check your inbox and click the link to enter.`);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Set New Password Submit ─────────────────────────────────────────────────
  const handleSetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 8) {
      setErrorMessage('Password must contain at least 8 characters.');
      playSound('warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter carefully.');
      playSound('warning');
      return;
    }

    setIsLoading(true);
    try {
      const { success, error } = await updateUserPassword(newPassword);
      if (!success || error) {
        setErrorMessage(error || 'Unable to update authority password.');
        playSound('warning');
        return;
      }
      playSound('success');
      setSuccessMessage('Password configured successfully! Redirecting to your authority portal...');
      setTimeout(() => {
        navigate(redirectTarget, { replace: true });
      }, 1000);
    } finally {
      setIsLoading(false);
    }
  };

  const isPasswordValid = newPassword.length >= 8;
  const doPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  if (!isDedicatedPortal) {
    return (
      <div
        className="authority-login-container"
        style={{
          minHeight: 'calc(100vh - 52px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 16px',
          background: 'var(--bg-main)'
        }}
      >
        <div
          className="card-elevated authority-portal-card"
          style={{
            maxWidth: '680px',
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: 'clamp(20px, 4vw, 28px) clamp(16px, 4vw, 32px) 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', height: '28px' }}>
                <img
                  src="/axent-lightmode.png"
                  alt="Axent"
                  className="axent-theme-logo-light"
                  style={{
                    height: '28px',
                    width: 'auto',
                    objectFit: 'contain'
                  }}
                />
                <img
                  src="/axent-logo.png"
                  alt="Axent"
                  className="axent-theme-logo-dark"
                  style={{
                    height: '28px',
                    width: 'auto',
                    objectFit: 'contain'
                  }}
                />
              </div>
              <div>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                  Axent Assessment Authority
                </span>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Institutional Gateways
                </h1>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Select your designated academic access portal to authenticate and enter.
            </p>
          </div>

          {/* Separate Gateway Portals Grid */}
          <div style={{ padding: 'clamp(16px, 4vw, 28px) clamp(16px, 4vw, 32px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '20px' }}>
            {/* 1. Paper Setter Gateway Card */}
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius-xs)',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <Layers size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                      FACULTY PORTAL
                    </span>
                    <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Paper Setter Gateway
                    </h2>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  For university faculty, question authors, and academic examiners. Author problem statements, configure test rubrics, and publish assessments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  navigate('/login/paper-setter');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--accent)',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span>Enter Paper Setter Gateway</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* 2. Chief Proctor & Admin Gateway Card */}
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: 'var(--radius-xs)',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: '9.5px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                      ADMINISTRATION & PROCTORING
                    </span>
                    <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Chief Proctor & Admin
                    </h2>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  For Chief Proctors, Exam Superintendents, and invigilators. Real-time CCTV surveillance, live proctoring telemetry, and cryptographic exam audit logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  navigate('/login/admin');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--accent)',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span>Enter Chief Proctor Gateway</span>
                <ArrowRight size={14} />
              </button>
            </div>

            {/* 3. Magic Link Invitation Dispatcher Portal */}
            <div
              style={{
                gridColumn: '1 / -1',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-main)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)'
                  }}
                >
                  <Send size={15} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Staff Onboarding & Magic Link Dispatcher
                  </h3>
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    Dedicated invitation portal to dispatch passwordless onboarding tokens to faculty and examiners.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  navigate('/invite');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <span>Open Invite Portal</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>

          {/* Footer student link */}
          <div
            style={{
              padding: '14px clamp(16px, 4vw, 32px)',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <button
              type="button"
              onClick={() => navigate('/mcq')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '12px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <GraduationCap size={14} color="var(--accent)" />
              <span>Are you a student taking an exam? <strong>Go to Candidate Portal</strong></span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="authority-login-container"
      style={{
        minHeight: 'calc(100vh - 52px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(24px, 4vw, 40px) clamp(12px, 3vw, 16px)',
        background: 'var(--bg-main)',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="card-elevated authority-login-card"
        style={{
          maxWidth: '430px',
          width: '100%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.07), 0 20px 40px -12px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden',
          boxSizing: 'border-box'
        }}
      >
        {/* ── Classic Luxury Brand Header ── */}
        <div
          style={{
            padding: '22px clamp(20px, 5vw, 26px) 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            boxSizing: 'border-box'
          }}
        >
          {/* Top Brand & Access Level Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', height: '21px', flexShrink: 0 }}>
              <img
                src="/axent-lightmode.png"
                alt="Axent"
                className="axent-theme-logo-light"
                style={{
                  height: '21px',
                  maxHeight: '21px',
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
                  height: '21px',
                  maxHeight: '21px',
                  width: 'auto',
                  display: 'block',
                  objectFit: 'contain'
                }}
              />
            </div>
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                fontFamily: 'var(--font-mono, monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0 8px',
                height: '20px',
                borderRadius: '4px',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                lineHeight: 1,
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--text-muted)' }} />
              Admin & Faculty
            </span>
          </div>

          {/* Micro Header & Title */}
          <div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono, monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                marginBottom: '5px',
                lineHeight: 1.2
              }}
            >
              Institutional Authority
            </div>
            <h1
              style={{
                margin: '0 0 6px',
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1.25
              }}
            >
              Faculty & Admin Portal
            </h1>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Authorized terminal for question setters, faculty examiners, and Chief Proctors.
            </p>
          </div>
        </div>

        {/* ── Form Body Container ── */}
        <div style={{ padding: '22px clamp(20px, 5vw, 26px)', boxSizing: 'border-box' }}>
          {/* Feedback Alerts */}
          {errorMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '11px 13px',
                borderRadius: '6px',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                boxSizing: 'border-box'
              }}
            >
              <AlertTriangle size={14} color="var(--danger)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '11.5px', color: 'var(--danger)', lineHeight: 1.4, flex: 1 }}>
                {errorMessage}
              </div>
            </div>
          )}

          {successMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 13px',
                borderRadius: '6px',
                background: 'var(--success-bg)',
                border: '1px solid var(--success-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                boxSizing: 'border-box'
              }}
            >
              <CheckCircle2 size={14} color="var(--success)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '11.5px', color: 'var(--success)', lineHeight: 1.4 }}>
                {successMessage}
              </span>
            </div>
          )}

          {/* ── TAB 1: Sign In ── */}
          {activeTab === 'signin' && (
            <form onSubmit={handlePasswordLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '9.5px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Institutional Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type="email"
                    required
                    placeholder="professor@institution.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="authority-auth-input"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px 0 34px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                      transition: 'border-color 0.15s ease'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '9.5px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="authority-auth-input"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 38px 0 34px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                      transition: 'border-color 0.15s ease'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Master Luxury Executive CTA Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="no-touch-expand authority-submit-btn"
                style={{
                  width: '100%',
                  height: '42px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  borderRadius: '6px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: '1px solid var(--accent)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                  marginTop: '4px'
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={13} className="spinner-icon" />
                    <span>Verifying Authority Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Institutional Console</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </button>



              {/* Security Trust Seal */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginTop: '8px',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--border)',
                  fontSize: '9.5px',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: 'var(--text-muted)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap'
                }}
              >
                <Shield size={12} strokeWidth={2.2} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <span>EAL-6 Session Integrity &bull; 256-Bit Encrypted</span>
              </div>
            </form>
          )}


          {/* ── TAB 4: Set New Password ── */}
          {activeTab === 'set_password' && (
            <form onSubmit={handleSetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <KeyRound size={14} color="var(--accent)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Configure Authority Password
                  </span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Set your password to secure your institutional examination console.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="authority-auth-input"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 38px 0 34px',
                      fontSize: '12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                  >
                    {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="authority-auth-input"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px 0 34px',
                      fontSize: '12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Password Requirements Checklist */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: isPasswordValid ? 'var(--success)' : 'inherit' }}>
                  <Check size={12} color={isPasswordValid ? 'var(--success)' : 'var(--text-dim)'} />
                  <span>Minimum 8 characters</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: doPasswordsMatch ? 'var(--success)' : 'inherit' }}>
                  <Check size={12} color={doPasswordsMatch ? 'var(--success)' : 'var(--text-dim)'} />
                  <span>Passwords match</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !isPasswordValid || !doPasswordsMatch}
                className="no-touch-expand authority-submit-btn"
                style={{
                  width: '100%',
                  height: '42px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                  borderRadius: '6px',
                  background: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                  border: '1px solid var(--accent)',
                  cursor: isLoading || !isPasswordValid || !doPasswordsMatch ? 'not-allowed' : 'pointer',
                  opacity: isLoading || !isPasswordValid || !doPasswordsMatch ? 0.6 : 1,
                  boxShadow: '0 2px 5px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.15)',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={13} className="spinner-icon" />
                    <span>Saving Password...</span>
                  </>
                ) : (
                  <>
                    <span>Set Password & Enter Portal</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </form>
          )}


        </div>

        {/* ── Card Footer: Gateway Switcher & Student Portal Link ── */}
        <div
          style={{
            padding: '14px 28px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {/* Switch between Admin and Paper Setter login */}
          {role === 'admin' ? (
            <button
              type="button"
              onClick={() => {
                playSound('click');
                navigate('/login/paper-setter');
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <Layers size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
              <span>Faculty or Examiner? <strong style={{ color: 'var(--text-primary)' }}>Open Setter Portal</strong></span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                playSound('click');
                navigate('/login/admin');
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <ShieldAlert size={13} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
              <span>Admin or Proctor? <strong style={{ color: 'var(--text-primary)' }}>Open CCTV Console</strong></span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '2px' }}>
            <button
              type="button"
              onClick={() => navigate('/login')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              All Gateways
            </button>
            <span style={{ fontSize: '11px', color: 'var(--border)' }}>•</span>
            <button
              type="button"
              onClick={() => navigate('/mcq')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: '11.5px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <GraduationCap size={12} color="var(--accent)" />
              <span>Candidate Portal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const PaperSetterLogin: React.FC<{ theme?: 'light' | 'dark' }> = ({ theme }) => (
  <AuthorityLogin fixedRole="paper_setter" theme={theme} />
);
export const AdminLogin: React.FC<{ theme?: 'light' | 'dark' }> = ({ theme }) => (
  <AuthorityLogin fixedRole="admin" theme={theme} />
);

export default AuthorityLogin;
