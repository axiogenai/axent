import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Send,
  Mail,
  User,
  Building,
  Layers,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Clock,
  ArrowRight,
  RefreshCw,
  GraduationCap,
  History,
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  LogOut
} from 'lucide-react';
import {
  sendMagicLink,
  AuthorityRole
} from '../../services/authService';
import { playSound } from '../../utils/sounds';

interface DispatchedInvite {
  id: string;
  email: string;
  name?: string;
  department?: string;
  role: AuthorityRole;
  dispatchedAt: string;
  directLink?: string;
}

const STORAGE_INVITES_KEY = 'axent_authority_dispatched_invites';
const AUTH_STORAGE_KEY = 'axent_magic_portal_authed';

const REQUIRED_ID = 'Teamaxiogen';
const REQUIRED_PASS = 'Adi.patil#1';

export const AuthorityInvitePortal: React.FC = () => {
  const navigate = useNavigate();
  const isDarkMode = typeof window !== 'undefined' && (
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    localStorage.getItem('codedna_theme') === 'dark'
  );

  // Authentication Gate states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [gateId, setGateId] = useState('');
  const [gatePass, setGatePass] = useState('');
  const [showGatePass, setShowGatePass] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Dispatcher Form states
  const [role, setRole] = useState<AuthorityRole>('paper_setter');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [validityHours, setValidityHours] = useState('48');

  // UI & Feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    email: string;
    role: AuthorityRole;
    directLink?: string;
  } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Recent Invites History
  const [recentInvites, setRecentInvites] = useState<DispatchedInvite[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_INVITES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_INVITES_KEY, JSON.stringify(recentInvites));
    } catch {}
  }, [recentInvites]);

  // Handle Security Gate Authentication
  const handleGateLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);

    const enteredId = gateId.trim().toLowerCase();
    const enteredPass = gatePass.trim();

    if (
      (enteredId === REQUIRED_ID.toLowerCase() || enteredId === 'teamaxiogen@axent.edu' || enteredId === 'teamaxiogen@axent.in') &&
      enteredPass === REQUIRED_PASS
    ) {
      playSound('success');
      setIsAuthenticated(true);
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, 'true');
      } catch {}
    } else {
      playSound('warning');
      setGateError('Invalid Authority ID or Security Password. Required: ID Teamaxiogen, Pass Adi.patil#1');
    }
  };

  const handleGateLogout = () => {
    playSound('click');
    setIsAuthenticated(false);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
  };

  // Handle Magic Link Dispatch
  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);
    setIsCopied(false);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Please provide an institutional faculty or proctor email address.');
      playSound('warning');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid institutional email format.');
      playSound('warning');
      return;
    }

    setIsLoading(true);
    try {
      const targetPortal = role === 'admin' ? '/admin' : '/paper-setter';
      const { success, error, directLink } = await sendMagicLink(trimmedEmail, targetPortal, role);

      if (!success || error) {
        setErrorMessage(error || 'Failed to dispatch magic link invitation.');
        playSound('warning');
        return;
      }

      playSound('success');
      const newInvite: DispatchedInvite = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: trimmedEmail,
        name: fullName.trim() || undefined,
        department: department.trim() || undefined,
        role,
        dispatchedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }),
        directLink
      };

      setRecentInvites((prev) => [newInvite, ...prev.slice(0, 9)]);
      setSuccessInfo({
        email: trimmedEmail,
        role,
        directLink
      });

      // Clear email input after dispatch
      setEmail('');
    } finally {
      setIsLoading(false);
    }
  };

  const copyDirectLink = (url?: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      playSound('click');
      setTimeout(() => setIsCopied(false), 2200);
    });
  };

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
          maxWidth: isAuthenticated ? '580px' : '440px',
          width: '100%',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
          transition: 'max-width 0.25s ease'
        }}
      >
        {/* ── Brand Header ── */}
        <div
          style={{
            padding: '26px 30px 20px',
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
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--accent)'
                }}
              >
                {isAuthenticated ? 'Authority Provisioning & Onboarding' : 'Restricted Security Gate'}
              </span>
              <h1
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em'
                }}
              >
                {isAuthenticated ? 'Magic Link Invite Dispatcher' : 'Magic Link Portal Gate'}
              </h1>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {isAuthenticated
              ? 'Dispatch cryptographic onboarding invites to faculty examiners and exam proctors without manual password setup.'
              : 'Enter institutional root credentials to unlock the Authority Magic Link Dispatcher.'}
          </p>
        </div>

        {/* ── 1. LOCKED SECURITY GATE (Authentication Required) ── */}
        {!isAuthenticated ? (
          <div style={{ padding: '24px 30px' }}>
            {/* Quick helper banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-xs)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                fontSize: '11px',
                color: 'var(--text-muted)'
              }}
            >
              <span>Configured ID: <strong style={{ color: 'var(--text-primary)' }}>Teamaxiogen</strong></span>
              <button
                type="button"
                onClick={() => {
                  setGateId('Teamaxiogen');
                  setGatePass('Adi.patil#1');
                  setGateError(null);
                }}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '3px 8px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)'
                }}
              >
                Fill Preset
              </button>
            </div>

            {gateError && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--danger-bg)',
                  border: '1px solid var(--danger-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <AlertTriangle size={15} color="var(--danger)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: 'var(--danger)', lineHeight: 1.4 }}>
                  {gateError}
                </div>
              </div>
            )}

            <form onSubmit={handleGateLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    marginBottom: '6px'
                  }}
                >
                  Authority ID
                </label>
                <div style={{ position: 'relative' }}>
                  <User
                    size={14}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type="text"
                    required
                    value={gateId}
                    onChange={(e) => setGateId(e.target.value)}
                    placeholder="Enter ID (Teamaxiogen)"
                    style={{
                      width: '100%',
                      padding: '10px 12px 10px 36px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-main)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    marginBottom: '6px'
                  }}
                >
                  Security Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock
                    size={14}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                  <input
                    type={showGatePass ? 'text' : 'password'}
                    required
                    value={gatePass}
                    onChange={(e) => setGatePass(e.target.value)}
                    placeholder="Enter password (Adi.patil#1)"
                    style={{
                      width: '100%',
                      padding: '10px 36px 10px 36px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-main)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGatePass(!showGatePass)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {showGatePass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: 'var(--radius-xs)',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--accent-fg)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: '8px'
                }}
              >
                <KeyRound size={15} />
                <span>Unlock Magic Link Dispatcher</span>
              </button>
            </form>
          </div>
        ) : (
          /* ── 2. UNLOCKED DISPATCHER INTERFACE ── */
          <>
            {/* Authenticated Authority Status Banner */}
            <div
              style={{
                padding: '10px 30px',
                background: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11.5px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} color="var(--accent)" />
                <span style={{ color: 'var(--text-muted)' }}>
                  Authenticated: <strong style={{ color: 'var(--text-primary)' }}>Teamaxiogen</strong> (Institutional Root)
                </span>
              </div>
              <button
                type="button"
                onClick={handleGateLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontSize: '11px',
                  color: 'var(--text-dim)',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={12} />
                <span>Lock Gate</span>
              </button>
            </div>

            {/* Role Selector: Paper Setter vs Admin */}
            <div style={{ padding: '20px 30px 10px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px'
                }}
              >
                Target Authority Role
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px'
                }}
              >
                {/* Option A: Paper Setter */}
                <button
                  type="button"
                  onClick={() => {
                    setRole('paper_setter');
                    playSound('click');
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: role === 'paper_setter' ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: role === 'paper_setter' ? 'var(--bg-surface)' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Layers size={15} color={role === 'paper_setter' ? 'var(--accent)' : 'var(--text-muted)'} />
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: role === 'paper_setter' ? 'var(--text-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      Paper Setter
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Faculty exam authoring & test curation
                  </span>
                </button>

                {/* Option B: Chief Proctor */}
                <button
                  type="button"
                  onClick={() => {
                    setRole('admin');
                    playSound('click');
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: role === 'admin' ? '1px solid var(--danger, #ef4444)' : '1px solid var(--border)',
                    background: role === 'admin' ? 'var(--bg-surface)' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <ShieldAlert size={15} color={role === 'admin' ? 'var(--danger, #ef4444)' : 'var(--text-muted)'} />
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: role === 'admin' ? 'var(--text-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      Chief Proctor
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    CCTV supervision & audit telemetry
                  </span>
                </button>
              </div>
            </div>

            {/* Form Container */}
            <form onSubmit={handleDispatch} style={{ padding: '10px 30px 24px' }}>
              {/* Quick Demo Presets */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  fontSize: '11px',
                  color: 'var(--text-muted)'
                }}
              >
                <span>Quick Demo Presets:</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setRole('paper_setter');
                      setEmail('setter.invite@axent.edu');
                      setFullName('Dr. Arvind Narayanan');
                      setDepartment('Computer Science');
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '2px 8px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Setter Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRole('admin');
                      setEmail('proctor.invite@axent.edu');
                      setFullName('Prof. Meenakshi Sundaram');
                      setDepartment('Office of the Controller of Exams');
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '2px 8px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Admin Demo
                  </button>
                </div>
              </div>

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
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '12px', color: 'var(--danger)', lineHeight: 1.4 }}>
                    {errorMessage}
                  </div>
                </div>
              )}

              {successInfo && (
                <div
                  style={{
                    marginBottom: '20px',
                    padding: '16px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <CheckCircle2 size={18} color="var(--accent)" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Invitation Dispatched Successfully!
                      </h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        Magic link dispatched to <strong style={{ color: 'var(--text-primary)' }}>{successInfo.email}</strong> configured for the <strong>{successInfo.role === 'admin' ? 'Chief Proctor' : 'Paper Setter'}</strong> gateway.
                      </p>
                    </div>
                  </div>

                  {/* Direct Link Copier */}
                  {successInfo.directLink && (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {successInfo.directLink}
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => copyDirectLink(successInfo.directLink)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'none',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: 'var(--text-primary)'
                          }}
                        >
                          {isCopied ? <Check size={12} color="var(--accent)" /> : <Copy size={12} />}
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                        <a
                          href={successInfo.directLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--accent)',
                            color: 'var(--accent-fg)',
                            border: 'none',
                            borderRadius: 'var(--radius-xs)',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            textDecoration: 'none'
                          }}
                        >
                          <span>Launch</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Email Address */}
              <div style={{ marginBottom: '14px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    marginBottom: '6px'
                  }}
                >
                  Institutional Email <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={role === 'admin' ? 'proctor@university.edu' : 'faculty.examiner@university.edu'}
                    required
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-main)',
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <Mail
                    size={14}
                    color="var(--text-muted)"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                  />
                </div>
              </div>

              {/* Name & Department (Two Columns) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-secondary)',
                      marginBottom: '6px'
                    }}
                  >
                    Full Name (Optional)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Dr. S. Ramanujan"
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 34px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-main)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <User
                      size={13}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-secondary)',
                      marginBottom: '6px'
                    }}
                  >
                    Department (Optional)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      placeholder="Computer Science"
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 34px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-main)',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Building
                      size={13}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                  </div>
                </div>
              </div>

              {/* Validity Window Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-secondary)',
                    marginBottom: '6px'
                  }}
                >
                  Link Validity Window
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { label: '24 Hours', value: '24' },
                    { label: '48 Hours', value: '48' },
                    { label: '7 Days', value: '168' },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setValidityHours(opt.value)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 'var(--radius-xs)',
                        border: validityHours === opt.value ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: validityHours === opt.value ? 'var(--bg-surface)' : 'transparent',
                        color: validityHours === opt.value ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <Clock size={12} style={{ display: 'inline', marginRight: '5px', verticalAlign: '-1px' }} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '11px 16px',
                  borderRadius: 'var(--radius-xs)',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'var(--accent-fg)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.75 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={15} className="spinner-icon" />
                    <span>Generating Cryptographic Invite...</span>
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    <span>Dispatch Magic Link Invitation</span>
                  </>
                )}
              </button>
            </form>

            {/* Recent Invites Audit Section */}
            {recentInvites.length > 0 && (
              <div
                style={{
                  padding: '18px 30px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg-surface)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <History size={13} color="var(--text-muted)" />
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                      Recent Session Dispatches ({recentInvites.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecentInvites([])}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: '10.5px',
                      color: 'var(--text-dim)',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {recentInvites.slice(0, 4).map((inv) => (
                    <div
                      key={inv.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-xs)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        fontSize: '11.5px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        {inv.role === 'admin' ? (
                          <ShieldAlert size={13} color="var(--danger, #ef4444)" />
                        ) : (
                          <Layers size={13} color="var(--accent)" />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {inv.email}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                            {inv.role === 'admin' ? 'Chief Proctor' : 'Paper Setter'} · {inv.dispatchedAt}
                          </div>
                        </div>
                      </div>

                      {inv.directLink && (
                        <button
                          type="button"
                          onClick={() => copyDirectLink(inv.directLink)}
                          title="Copy invite link"
                          style={{
                            background: 'none',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '3px 6px',
                            cursor: 'pointer',
                            color: 'var(--text-muted)'
                          }}
                        >
                          <Copy size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Card Footer: Dedicated Portals Navigation ── */}
        <div
          style={{
            padding: '14px 30px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px'
          }}
        >
          <div style={{ display: 'flex', gap: '14px' }}>
            <Link to="/login/paper-setter" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 600 }}>
              ← Setter Portal
            </Link>
            <Link to="/login/admin" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 600 }}>
              ← Admin Portal
            </Link>
          </div>
          <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Gateways Directory →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AuthorityInvitePortal;
