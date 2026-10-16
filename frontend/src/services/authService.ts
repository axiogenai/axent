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
  // Only Supabase-issued sessions count as authentication.
  if (!isSupabaseConnected()) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[AuthService] Unable to verify Supabase session:', error.message);
      return null;
    }
    return data.session ?? null;
  } catch (err) {
    console.warn('[AuthService] Error fetching Supabase session:', err);
    return null;
  }
}

export async function getAuthUser(): Promise<User | null> {
  const session = await getAuthSession();
  return session?.user ?? null;
}

export function getStoredAuthorityRole(): AuthorityRole {
  if (typeof window === 'undefined') return 'paper_setter';
  const role = localStorage.getItem(LOCAL_ROLE_KEY);
  if (role === 'admin' || role === 'paper_setter') return role;
  return 'paper_setter';
}

export function setStoredAuthorityRole(role: AuthorityRole): void {
  localStorage.setItem(LOCAL_ROLE_KEY, role);
}

// ── Auth State Listener ───────────────────────────────────────────────────────

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  if (!isSupabaseConnected()) return () => undefined;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
  if (!isSupabaseConnected()) {
    return { user: null, session: null, error: 'Authentication service is unavailable. Please try again when the connection is restored.' };
  }
  try {
    const normalizedEmail = trimmedEmail.includes('@') ? trimmedEmail : `${trimmedEmail}@axent.edu`;
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: pass });
    if (error || !data.session || !data.user) {
      return { user: null, session: null, error: error?.message || 'Authentication failed.' };
    }
    // This only remembers the selected UI portal; it does not grant a role.
    localStorage.setItem(LOCAL_ROLE_KEY, role);
    return { user: data.user, session: data.session, error: null };
  } catch (err: any) {
    return { user: null, session: null, error: err?.message || 'Authentication service unreachable.' };
  }
}

// ── Sign Up With Password (Direct Institutional Registration) ─────────────────

export async function signUpWithPassword(
  email: string,
  pass: string,
  role: AuthorityRole = 'paper_setter'
): Promise<{ user: User | null; session: Session | null; error: string | null; needsEmailConfirmation?: boolean }> {
  const trimmedEmail = email.trim().toLowerCase();

  // Administrator privileges must be provisioned by a trusted Supabase admin and
  // stored in app_metadata. Public self-registration must never grant admin access.
  if (role === 'admin') {
    return { user: null, session: null, error: 'Administrator accounts must be provisioned by the platform administrator.' };
  }
  if (!trimmedEmail) {
    return { user: null, session: null, error: 'Institutional email address is required.' };
  }
  if (!pass || pass.length < 8) {
    return { user: null, session: null, error: 'Password must be at least 8 characters long.' };
  }

  setStoredAuthorityRole(role);

  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const redirectUrl = `${origin}/login?type=invite&redirect=${encodeURIComponent('/paper-setter')}`;

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: pass,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          role: 'paper_setter',
          portal: 'paper_setter'
        }
      }
    });

    if (error) {
      return { user: null, session: null, error: error.message };
    }

    if (data.session) {
      localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(data.session));
      localStorage.setItem(LOCAL_ROLE_KEY, role);
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
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(trimmedEmail)) {
    return { success: false, error: 'Please enter a valid email format.' };
  }
  if (!isSupabaseConnected()) {
    return { success: false, error: 'Authentication service is unavailable. No invitation was sent.' };
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectPath = role === 'admin' ? '/login/admin' : '/login/paper-setter';
  const redirectUrl = `${origin}${redirectPath}?type=invite&redirect=${encodeURIComponent(targetPortal)}`;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { emailRedirectTo: redirectUrl, shouldCreateUser: false }
    });
    if (error) return { success: false, error: error.message };
    return { success: true, error: null, isDirectLink: false };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Invitation email could not be sent.' };
  }
}

// Query-string invite tokens are not authentication. The provider must verify the user.
export function loginWithInviteToken(
  _token: string,
  _email: string,
  _role: AuthorityRole = 'paper_setter'
): null {
  return null;
}
// ── Update / Set Authority Password ──────────────────────────────────────────

export async function updateUserPassword(
  newPass: string,
  _targetEmail?: string
): Promise<{ success: boolean; error: string | null }> {
  if (!newPass || newPass.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }
  if (!isSupabaseConnected()) {
    return { success: false, error: 'Authentication service is unavailable. Sign in through a verified account before changing your password.' };
  }
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'A verified authentication session is required to change your password.' };
    }
    const { error } = await supabase.auth.updateUser({ password: newPass });
    if (error) return { success: false, error: error.message };
    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unable to update password.' };
  }
}

// ── Sign Out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('[AuthService] Supabase sign out error:', err);
  } finally {
    try {
      localStorage.removeItem(LOCAL_AUTH_KEY);
      sessionStorage.removeItem(LOCAL_AUTH_KEY);
    } catch {}
  }
}
