import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Sparkles,
  RefreshCw,
  Check
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

type LoginTab = 'password' | 'magic_link' | 'set_password';

export const AuthorityLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Route target redirect and preselected role
  const redirectTarget = searchParams.get('redirect') || '/paper-setter';
  const roleParam = searchParams.get('role');
  const typeParam = searchParams.get('type');

  const [role, setRole] = useState<AuthorityRole>(() => {
    if (roleParam === 'admin' || redirectTarget.includes('admin')) return 'admin';
    return 'paper_setter';
  });

  const [activeTab, setActiveTab] = useState<LoginTab>(() => {
    if (typeParam === 'recovery' || typeParam === 'invite') return 'set_password';
    return 'password';
  });

  // Form Fields
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

  // Detect Supabase access_token or recovery hash on initial mount
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token=') || hash.includes('type=recovery') || hash.includes('type=invite'))) {
      setActiveTab('set_password');
      setSuccessMessage('Authority link verified. Please configure your institutional password below.');
    } else {
      // Check if user is already authenticated
      void getAuthSession().then((session) => {
        if (session && !typeParam) {
          navigate(redirectTarget, { replace: true });
        }
      });
    }
  }, [navigate, redirectTarget, typeParam]);

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
      setErrorMessage('Please provide a valid institutional email format.');
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
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage('Please provide a valid email format.');
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
      setSuccessMessage(`Magic link dispatched to ${trimmedEmail}. Check your institutional email and click the link to enter.`);
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
      }, 1200);
    } finally {
      setIsLoading(false);
    }
  };

  // Local development bypass (so offline testing is never blocked)
  const handleDevBypass = () => {
    const dummySession = {
      access_token: 'dev-token',
      user: {
        id: 'dev-authority-id',
        email: email || 'authority@axent.edu',
        user_metadata: { role }
      }
    };
    try {
      localStorage.setItem('axent_authority_session', JSON.stringify(dummySession));
      setStoredAuthorityRole(role);
    } catch {}
    playSound('success');
    navigate(redirectTarget, { replace: true });
  };

  const isPasswordValid = newPassword.length >= 8;
  const doPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 52px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: 'var(--bg-main)'
      }}
    >
      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-md)'
        }}
      >
        {/* Institutional Header Banner */}
        <div
          style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px'
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0
            }}
          >
            <Hexagon size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 'var(--radius-pill)' }}>
                Institutional Gateway
              </span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Supabase Auth
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Authority Portal Sign In
            </h1>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Examination authoring, question banks & live invigilation
            </p>
          </div>
        </div>

        {/* Portal Role Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            padding: '6px'
          }}
        >
          <button
            type="button"
            onClick={() => handleRoleSelect('paper_setter')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--radius-xs)',
              border: role === 'paper_setter' ? '1px solid var(--border)' : '1px solid transparent',
              background: role === 'paper_setter' ? 'var(--bg-elevated)' : 'transparent',
              color: role === 'paper_setter' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={13} color={role === 'paper_setter' ? 'var(--accent)' : 'inherit'} />
            <span>Paper Setter</span>
          </button>

          <button
            type="button"
            onClick={() => handleRoleSelect('admin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: 'var(--radius-xs)',
              border: role === 'admin' ? '1px solid var(--border)' : '1px solid transparent',
              background: role === 'admin' ? 'var(--bg-elevated)' : 'transparent',
              color: role === 'admin' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <ShieldAlert size={13} color={role === 'admin' ? 'var(--accent)' : 'inherit'} />
            <span>Chief Proctor / Admin</span>
          </button>
        </div>

        {/* Card Body */}
        <div style={{ padding: '24px 28px' }}>
          {/* Method Selector Tabs (Password vs Magic Link) */}
          {activeTab !== 'set_password' && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => { setActiveTab('password'); setErrorMessage(null); }}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  border: activeTab === 'password' ? '1px solid var(--border)' : '1px solid transparent',
                  background: activeTab === 'password' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'password' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                Password Login
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('magic_link'); setErrorMessage(null); }}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-xs)',
                  border: activeTab === 'magic_link' ? '1px solid var(--border)' : '1px solid transparent',
                  background: activeTab === 'magic_link' ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === 'magic_link' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                Magic Link / Invite
              </button>
            </div>
          )}

          {/* Feedback Alerts */}
          {errorMessage && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--danger-bg)',
                border: '1px solid var(--danger-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <AlertTriangle size={14} color="var(--danger)" style={{ marginTop: '2px', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--danger)', lineHeight: 1.4 }}>
                {errorMessage}
              </span>
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

          {/* ── Mode 1: Password Login Form ── */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Institutional Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="email"
                    required
                    placeholder="professor@institution.edu"
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('magic_link'); setErrorMessage(null); }}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: '11.5px', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Send Magic Link?
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

          {/* ── Mode 2: Magic Link / Authority Invite ── */}
          {activeTab === 'magic_link' && (
            <form onSubmit={handleMagicLinkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '5px' }}>
                  Institutional Email
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="email"
                    required
                    placeholder="dean@institution.edu"
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
                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Invited authorities receive a secure one-click link. Upon opening, you can immediately set your password and access the console.
                </p>
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
                  fontWeight: 700
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={14} className="spinner-icon" />
                    <span>Dispatching Magic Link...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Send Magic Link Invite</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── Mode 3: Set New Authority Password ── */}
          {activeTab === 'set_password' && (
            <form onSubmit={handleSetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <KeyRound size={14} color="var(--accent)" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Set Your Authority Password
                  </span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Welcome to Axent! Choose a strong password to secure your institutional examination console.
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
            </form>
          )}

          {/* Institutional Developer Fallback */}
          <div
            style={{
              marginTop: '22px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Campus LAN / Offline Mode?
            </span>
            <button
              type="button"
              onClick={handleDevBypass}
              style={{
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xs)',
                padding: '4px 10px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Direct Access (Dev Mode)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthorityLogin;
