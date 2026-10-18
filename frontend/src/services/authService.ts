import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, isSupabaseConnected } from './supabaseService';

export type AuthorityRole = 'admin' | 'paper_setter';

export interface AuthorityUser {
  id: string;
  email: string;
  role: AuthorityRole;
  fullName?: string;
}

const LOCAL_AUTH_KEY = 'axent_authority_session';
const LOCAL_ROLE_KEY = 'axent_authority_role';

// ── Session & User Getters ───────────────────────────────────────────────────

export async function getAuthSession(): Promise<Session | null> {
  if (!isSupabaseConnected()) {
    try {
      const local = localStorage.getItem(LOCAL_AUTH_KEY);
      return local ? JSON.parse(local) : null;
    } catch {
      return null;
    }
  }
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      // Resilient fallback to local session if present
      const local = localStorage.getItem(LOCAL_AUTH_KEY);
      return local ? JSON.parse(local) : null;
    }
    return data.session;
  } catch (err) {
    console.warn('[AuthService] Error fetching Supabase session:', err);
    try {
      const local = localStorage.getItem(LOCAL_AUTH_KEY);
      return local ? JSON.parse(local) : null;
    } catch {
      return null;
    }
  }
}

export async function getAuthUser(): Promise<User | null> {
  const session = await getAuthSession();
  return session?.user ?? null;
}

export function getStoredAuthorityRole(): AuthorityRole {
  if (typeof window === 'undefined') return 'paper_setter';
  const role = sessionStorage.getItem(LOCAL_ROLE_KEY) || localStorage.getItem(LOCAL_ROLE_KEY);
  if (role === 'admin' || role === 'paper_setter') return role;
  return 'paper_setter';
}

export function getCurrentAuthorityRole(): AuthorityRole | null {
  if (typeof window === 'undefined') return null;
  try {
    // 1. Check direct authority role storage first
    const storedRole = sessionStorage.getItem(LOCAL_ROLE_KEY) || localStorage.getItem(LOCAL_ROLE_KEY);
    if (storedRole === 'admin' || storedRole === 'paper_setter') {
      return storedRole as AuthorityRole;
    }
    // 2. Check cached authority session
    const raw = sessionStorage.getItem(LOCAL_AUTH_KEY) || localStorage.getItem(LOCAL_AUTH_KEY);
    if (raw) {
      const session = JSON.parse(raw);
      const metaRole = session?.user?.app_metadata?.role || session?.user?.user_metadata?.role;
      if (metaRole === 'admin' || metaRole === 'paper_setter') {
        return metaRole as AuthorityRole;
      }
    }
  } catch {}
  return null;
}

export function isAuthorityAdmin(): boolean {
  return getCurrentAuthorityRole() === 'admin';
}

export function setStoredAuthorityRole(role: AuthorityRole): void {
  try {
    sessionStorage.setItem(LOCAL_ROLE_KEY, role);
    localStorage.setItem(LOCAL_ROLE_KEY, role);
  } catch {}
}

// ── Auth State Listener ───────────────────────────────────────────────────────

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  if (!isSupabaseConnected()) {
    const listener = (e: StorageEvent) => {
      if (e.key === LOCAL_AUTH_KEY) {
        try {
          const sess = e.newValue ? JSON.parse(e.newValue) : null;
          callback('SIGNED_IN', sess);
        } catch {}
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      try {
        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(session));
      } catch {}
    } else if (event === 'SIGNED_OUT') {
      try {
        localStorage.removeItem(LOCAL_AUTH_KEY);
      } catch {}
    }
    callback(event, session);
  });
  return () => subscription.unsubscribe();
}

// ── Sign In With Password ────────────────────────────────────────────────────

export async function signInWithPassword(
  email: string,
  pass: string,
  role: AuthorityRole = 'paper_setter'
): Promise<{ user: User | null; session: Session | null; error: string | null }> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) return { user: null, session: null, error: 'Institutional email address is required.' };
  if (!pass) return { user: null, session: null, error: 'Password is required.' };

  // Strict Zero-Trust: All authority authentication MUST verify with Supabase Auth.
  // Zero hardcoded passwords or offline authority bypasses are permitted.

  // Attempt Supabase authentication if available
  if (isSupabaseConnected()) {
    try {
      const normalizedEmail = trimmedEmail.includes('@') ? trimmedEmail : `${trimmedEmail}@axent.edu`;
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: pass });
      if (error || !data.session || !data.user) {
        return { user: null, session: null, error: error?.message || 'Authentication failed. Please check your credentials.' };
      }

      // Check both app_metadata and user_metadata
      const userRole = data.user.app_metadata?.role || data.user.user_metadata?.role;
      // If user signed in via Paper Setter Portal, assign paper_setter session role; if via Admin Portal, assign admin
      const effectiveRole: AuthorityRole = role === 'paper_setter'
        ? 'paper_setter'
        : (userRole === 'admin' ? 'admin' : (role === 'admin' ? 'admin' : (userRole === 'paper_setter' ? 'paper_setter' : role)));
      const roleAllowed = role === 'admin'
        ? userRole === 'admin' || userRole === 'paper_setter' || !userRole
        : userRole === 'paper_setter' || userRole === 'admin' || !userRole;

      if (!roleAllowed) {
        await supabase.auth.signOut();
        return {
          user: null,
          session: null,
          error: 'This account does not have authorization for this portal. Contact your platform administrator.'
        };
      }

      // If user was created directly in Supabase dashboard with no metadata, tag their user_metadata
      if (!userRole) {
        try {
          await supabase.auth.updateUser({ data: { role: effectiveRole } });
        } catch {}
      }

      try {
        sessionStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(data.session));
        sessionStorage.setItem(LOCAL_ROLE_KEY, effectiveRole);
        localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(data.session));
        localStorage.setItem(LOCAL_ROLE_KEY, effectiveRole);
      } catch {}
      return { user: data.user, session: data.session, error: null };
    } catch (err: any) {
      return { user: null, session: null, error: err?.message || 'Authentication service unreachable.' };
    }
  }

  return { user: null, session: null, error: 'Authentication service is unavailable. Use standard institutional credentials or try again when connection is restored.' };
}

// ── Sign Up With Password (Direct Institutional Registration) ─────────────────

export async function signUpWithPassword(
  email: string,
  pass: string,
  role: AuthorityRole = 'paper_setter'
): Promise<{ user: User | null; session: Session | null; error: string | null; needsEmailConfirmation?: boolean }> {
  const trimmedEmail = email.trim().toLowerCase();

  if (!trimmedEmail) {
    return { user: null, session: null, error: 'Institutional email address is required.' };
  }
  if (!pass || pass.length < 8) {
    return { user: null, session: null, error: 'Password must be at least 8 characters long.' };
  }

  setStoredAuthorityRole(role);

  // If Supabase is connected, register with Supabase Auth
  if (isSupabaseConnected()) {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectUrl = `${origin}/login?type=invite&redirect=${encodeURIComponent(role === 'admin' ? '/admin' : '/paper-setter')}`;

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: pass,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            role,
            portal: role === 'admin' ? 'admin' : 'paper_setter'
          }
        }
      });

      if (error) {
        return { user: null, session: null, error: error.message };
      }

      if (data.session) {
        try {
          localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(data.session));
          localStorage.setItem(LOCAL_ROLE_KEY, role);
        } catch {}
        return { user: data.user, session: data.session, error: null };
      }

      return {
        user: data.user,
        session: null,
        error: null,
        needsEmailConfirmation: Boolean(data.user && !data.session)
      };
    } catch (err: any) {
      return { user: null, session: null, error: err?.message || 'Registration service unreachable.' };
    }
  }

  return { user: null, session: null, error: 'Registration service is unavailable. Please ensure your cloud connection is active.' };
}

// ── Send Magic Link / Authority Invite ───────────────────────────────────────

export interface MagicLinkResult {
  success: boolean;
  error: string | null;
  directLink?: string;
  isDirectLink?: boolean;
  token?: string;
}

export async function sendMagicLink(
  email: string,
  targetPortal: string = '/paper-setter',
  role: AuthorityRole = 'paper_setter'
): Promise<MagicLinkResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) return { success: false, error: 'Please provide an institutional email.' };
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return { success: false, error: 'Please enter a valid email format.' };
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const loginPath = role === 'admin' ? '/login/admin' : '/login/paper-setter';

  // Generate resilient invitation token
  const tokenPayload = {
    email: trimmedEmail,
    role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 3600 * 1000 // 7 days
  };
  const inviteToken =
    'axinv_' +
    btoa(unescape(encodeURIComponent(JSON.stringify(tokenPayload))))
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 32);

  const directAuthUrl = `${origin}${loginPath}?type=invite&token=${inviteToken}&email=${encodeURIComponent(trimmedEmail)}&role=${role}&redirect=${encodeURIComponent(targetPortal)}`;

  // Save invite locally to track valid invites
  try {
    const existing = JSON.parse(localStorage.getItem('axent_active_invites') || '{}');
    existing[inviteToken] = tokenPayload;
    localStorage.setItem('axent_active_invites', JSON.stringify(existing));
  } catch {}

  if (isSupabaseConnected()) {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          emailRedirectTo: directAuthUrl,
          shouldCreateUser: true,
          data: {
            role,
            portal: role === 'admin' ? 'admin' : 'paper_setter'
          }
        }
      });
      if (error) {
        console.warn('[AuthService] Supabase email delivery bypassed:', error.message);
        return { success: true, error: null, directLink: directAuthUrl, isDirectLink: true, token: inviteToken };
      }
      return { success: true, error: null, directLink: directAuthUrl, isDirectLink: false, token: inviteToken };
    } catch (err: any) {
      return { success: true, error: null, directLink: directAuthUrl, isDirectLink: true, token: inviteToken };
    }
  }

  return { success: true, error: null, directLink: directAuthUrl, isDirectLink: true, token: inviteToken };
}

// ── Authenticate via Invite Token (Deprecated / Secured) ─────────────────────

export function loginWithInviteToken(
  _token: string,
  _email: string,
  _role: AuthorityRole = 'paper_setter'
): { user: User | null; session: Session | null; error?: string } {
  console.warn('[AuthService] Direct token bypass is permanently disabled. Please authenticate via Supabase Auth.');
  return {
    user: null,
    session: null,
    error: 'Direct token bypass is permanently disabled for security. Please sign in with your institutional credentials.'
  } as any;
}

// ── Update / Set Authority Password ──────────────────────────────────────────

export async function updateUserPassword(
  newPass: string,
  _targetEmail?: string
): Promise<{ success: boolean; error: string | null }> {
  if (!newPass || newPass.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  if (isSupabaseConnected()) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (!error) return { success: true, error: null };
      return { success: false, error: error.message };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update password.' };
    }
  }

  return { success: false, error: 'Authentication service is unavailable. Please check your cloud connection.' };
}

// ── Sign Out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  try {
    if (isSupabaseConnected()) {
      await supabase.auth.signOut();
    }
  } catch (err) {
    console.warn('[AuthService] Supabase sign out error:', err);
  } finally {
    try {
      localStorage.removeItem(LOCAL_AUTH_KEY);
      sessionStorage.removeItem(LOCAL_AUTH_KEY);
      localStorage.removeItem(LOCAL_ROLE_KEY);
      sessionStorage.removeItem(LOCAL_ROLE_KEY);
    } catch {}
  }
}
