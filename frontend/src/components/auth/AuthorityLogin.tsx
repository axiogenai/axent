import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom';
import {
  Hexagon,
  Shield,
  KeyRound,
  Mail,
  Lock,
  User,
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
  signUpWithPassword,
  sendMagicLink,
  updateUserPassword,
  getAuthSession,
  AuthorityRole,
  setStoredAuthorityRole
} from '../../services/authService';
import { playSound } from '../../utils/sounds';

type AuthTab = 'signin' | 'register' | 'magic_link' | 'set_password';

export interface AuthorityLoginProps {
  fixedRole?: AuthorityRole;
}

export const AuthorityLogin: React.FC<AuthorityLoginProps> = ({ fixedRole }) => {
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
  const redirectTarget = searchParams.get('redirect') || defaultRedirect;

  const [role, setRole] = useState<AuthorityRole>(effectiveRole);
  const isDarkMode = typeof window !== 'undefined' && (
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    localStorage.getItem('codedna_theme') === 'dark'
  );

  const [activeTab, setActiveTab] = useState<AuthTab>(() => {
    if (typeParam === 'recovery' || typeParam === 'invite') return 'set_password';
    return 'signin';
  });

  // Sign In & Registration Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Set New Password Fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Status & UI States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Only provider-verified Supabase callbacks may establish an authenticated session.
  useEffect(() => {
    const hash = window.location.hash;
    const hasProviderCallback = hash.includes('access_token=') ||
      hash.includes('type=recovery') || hash.includes('type=invite');
    if (hasProviderCallback) {
      setActiveTab('set_password');
      setSuccessMessage('Authentication callback detected. Complete this step only after the provider session is verified.');
      return;
    }
    if (typeParam === 'invite' || searchParams.has('token')) {
      setActiveTab('signin');
      setErrorMessage('This invitation link is not verified. Request a fresh sign-in link from the authentication service.');
      return;
    }
    void getAuthSession().then((session) => {
      if (session && !typeParam) navigate(redirectTarget, { replace: true });
    });
  }, [navigate, redirectTarget, typeParam, searchParams]);

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
      setErrorMessage('Institutional Authority ID or email address is required.');
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
        navigate(redirectTarget, { replace: true });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Institutional Registration Submit ────────────────────────────────────────
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage('Full name is required (min 2 characters).');
      playSound('warning');
      return;
    }
    if (!trimmedEmail) {
      setErrorMessage('Institutional email is required.');
      playSound('warning');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must contain at least 8 characters.');
      playSound('warning');
      return;
    }

    setIsLoading(true);
    try {
      const { user, error, needsEmailConfirmation } = await signUpWithPassword(trimmedEmail, password, role);
      if (error) {
        setErrorMessage(error);
        playSound('warning');
        return;
      }
      if (user) {
        playSound('success');
        if (needsEmailConfirmation) {
          setSuccessMessage(`Registration received! Confirm your email before signing in.`);
        } else {
          setSuccessMessage('Authority account configured! Entering portal...');
          setTimeout(() => {
            navigate(redirectTarget, { replace: true });
          }, 800);
        }
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
              padding: '28px 32px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <img
                src={isDarkMode ? '/axent-logo.png' : '/axent-lightmode.png'}
                alt="Axent"
                style={{
                  height: '28px',
                  width: 'auto',
                  display: 'block',
                  objectFit: 'contain'
                }}
              />
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>
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
          <div style={{ padding: '28px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
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
                      color: 'var(--accent)'
                    }}
                  >
                    <Layers size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>
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
                  color: 'var(--accent-fg)',
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
                      color: 'var(--danger, #ef4444)'
                    }}
                  >
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--danger, #ef4444)' }}>
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
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
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
              padding: '14px 32px',
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
      style={{
        minHeight: 'calc(100vh - 52px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 16px',
        background: 'var(--bg-main)'
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden'
        }}
      >
        {/* ── Dedicated Brand Header (Role Specific) ── */}
        <div
          style={{
            padding: '24px 28px 18px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <img
              src={isDarkMode ? '/axent-logo.png' : '/axent-lightmode.png'}
              alt="Axent"
              style={{
                height: '28px',
                width: 'auto',
                display: 'block',
                objectFit: 'contain'
              }}
            />
            <div>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: role === 'admin' ? 'var(--danger, #ef4444)' : 'var(--accent)'
                }}
              >
                {role === 'admin' ? 'Administration & Proctoring' : 'Faculty Examination Portal'}
              </span>
              <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {role === 'admin' ? 'Chief Proctor & Admin Portal' : 'Paper Setter Gateway'}
              </h1>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {role === 'admin'
              ? 'Authorized portal for live CCTV invigilation, real-time telemetry, and candidate integrity audits.'
              : 'Authorized portal for faculty question authoring, syllabus configuration, and test deployment.'}
          </p>
        </div>

        {/* ── Watermelon UI Tabs List (Sign In / Register) ── */}
        {activeTab !== 'set_password' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)'
            }}
          >
            <button
              type="button"
              onClick={() => { setActiveTab('signin'); setErrorMessage(null); }}
              style={{
                padding: '10px 14px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'signin' ? 700 : 500,
                color: activeTab === 'signin' ? 'var(--text-primary)' : 'var(--text-muted)',
                background: activeTab === 'signin' ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'signin' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('register'); setErrorMessage(null); }}
              style={{
                padding: '10px 14px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'register' ? 700 : 500,
                color: activeTab === 'register' ? 'var(--text-primary)' : 'var(--text-muted)',
                background: activeTab === 'register' ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'register' ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Create Account
            </button>
          </div>
        )}

        {/* ── Body Container ── */}
        <div style={{ padding: '24px 28px' }}>
          {/* Feedback Alerts */}
          {errorMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertTriangle size={15} color="var(--danger)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: 'var(--danger)', lineHeight: 1.4, flex: 1 }}>
                  {errorMessage}
                </div>
              </div>

              {(errorMessage.includes('confirmation email') || errorMessage.includes('rate limit') || errorMessage.includes('SMTP')) && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                    Supabase Free-Tier Email Limit Reached (3 emails/hr)
                  </div>
                  <div style={{ marginBottom: '8px', color: 'var(--text-muted)' }}>
                    If email delivery fails, configure the Supabase email provider. Direct bypass and default passwords are disabled.
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('signin');
                        setPassword('');
                        setErrorMessage(null);
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ height: '26px', fontSize: '11px', padding: '0 8px', border: '1px solid var(--border)' }}
                    >
                      Back to sign in
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {successMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--success-bg)',
                border: '1px solid var(--success-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={14} color="var(--success)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--success)', lineHeight: 1.4 }}>
                {successMessage}
              </span>
            </div>
          )}

          {/* ── TAB 1: Sign In ── */}
          {activeTab === 'signin' && (
            <form onSubmit={handlePasswordLogin} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Institutional Email or Authority ID
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    required
                    placeholder="teamaxiogen or professor@institution.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px 0 34px',
                      fontSize: '13px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click');
                      navigate('/invite');
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '11.5px', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Need an Invite Link?
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter authority password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 36px 0 34px',
                      fontSize: '13px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  marginTop: '4px'
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={14} className="spinner-icon" />
                    <span>Verifying Authority Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Enter {role === 'admin' ? 'Admin Console' : 'Paper Setter Portal'}</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── TAB 2: Institutional Registration ── */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Full Name / Faculty Title
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    required
                    placeholder="Prof. Jane Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px 0 34px',
                      fontSize: '13px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Work / Institutional Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="email"
                    required
                    placeholder="jane.doe@institution.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px 0 34px',
                      fontSize: '13px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Choose Password (Min 8 Characters)
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Create strong authority password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 36px 0 34px',
                      fontSize: '13px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary"
                style={{
                  width: '100%',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  marginTop: '4px'
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={14} className="spinner-icon" />
                    <span>Registering Institutional Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create {role === 'admin' ? 'Chief Proctor' : 'Paper Setter'} Account</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
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
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 36px 0 34px',
                      fontSize: '13px',
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
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px 0 34px',
                      fontSize: '13px',
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
                className="btn btn-primary"
                style={{
                  width: '100%',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 700
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={14} className="spinner-icon" />
                    <span>Saving Password...</span>
                  </>
                ) : (
                  <>
                    <span>Set Password & Enter Portal</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  playSound('success');
                  navigate(redirectTarget, { replace: true });
                }}
                style={{
                  width: '100%',
                  height: '38px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <span>Enter Portal Directly</span>
                <ArrowRight size={13} />
              </button>
            </form>
          )}


        </div>

        {/* ── Card Footer: Return to Candidate Terminal ── */}
        <div
          style={{
            padding: '12px 28px',
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
            <GraduationCap size={13} color="var(--accent)" />
            <span>Are you a student taking an exam? <strong>Go to Candidate Portal</strong></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const PaperSetterLogin: React.FC = () => <AuthorityLogin fixedRole="paper_setter" />;
export const AdminLogin: React.FC = () => <AuthorityLogin fixedRole="admin" />;

export default AuthorityLogin;
