/**
 * Utility for dynamically resolving client IP, network details,
 * browser environment, and dynamic last-active timestamps.
 */

let _cachedClientIp: string | null = null;
let _isFetchingIp = false;

// Initialize IP resolution proactively in the background
if (typeof window !== 'undefined') {
  try {
    const stored = sessionStorage.getItem('codedna_client_ip') || localStorage.getItem('codedna_client_ip');
    if (stored && stored.trim()) {
      _cachedClientIp = stored.trim();
    }
  } catch {}
  void resolveRealClientIp();
}

/**
 * Asynchronously query public IP with fallback to Cloudflare trace
 */
export async function resolveRealClientIp(): Promise<string | null> {
  if (_cachedClientIp) return _cachedClientIp;
  if (_isFetchingIp) return null;
  _isFetchingIp = true;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    // Primary: ipify
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ip) {
          clearTimeout(timeoutId);
          _cachedClientIp = String(data.ip).trim();
          try {
            sessionStorage.setItem('codedna_client_ip', _cachedClientIp);
            localStorage.setItem('codedna_client_ip', _cachedClientIp);
          } catch {}
          _isFetchingIp = false;
          return _cachedClientIp;
        }
      }
    } catch {}

    // Fallback: Cloudflare trace
    try {
      const cfRes = await fetch('https://cloudflare.com/cdn-cgi/trace', { signal: controller.signal });
      if (cfRes.ok) {
        const text = await cfRes.text();
        const ipLine = text.split('\n').find((l) => l.startsWith('ip='));
        if (ipLine) {
          const ip = ipLine.replace('ip=', '').trim();
          if (ip) {
            clearTimeout(timeoutId);
            _cachedClientIp = ip;
            try {
              sessionStorage.setItem('codedna_client_ip', _cachedClientIp);
              localStorage.setItem('codedna_client_ip', _cachedClientIp);
            } catch {}
            _isFetchingIp = false;
            return _cachedClientIp;
          }
        }
      }
    } catch {}

    clearTimeout(timeoutId);
  } catch {
  } finally {
    _isFetchingIp = false;
  }

  return _cachedClientIp;
}

/**
 * Synchronously get dynamic client IP, deriving a deterministic institutional subnet IP
 * if external DNS/web lookup has not resolved or is offline.
 */
export function getDynamicClientIp(seedRoll?: string, seedStation?: string): string {
  if (_cachedClientIp && _cachedClientIp.length > 3) {
    return _cachedClientIp;
  }

  try {
    const stored = sessionStorage.getItem('codedna_client_ip') || localStorage.getItem('codedna_client_ip');
    if (stored && stored.trim()) {
      _cachedClientIp = stored.trim();
      return _cachedClientIp;
    }
  } catch {}

  // Trigger background resolve for subsequent sync ticks
  void resolveRealClientIp();

  // If not yet resolved or offline in lab, generate a distinct institutional IP for this candidate
  const seed = (seedRoll || seedStation || 'candidate_station_01').trim().toUpperCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const subnet = Math.abs(hash % 10) + 1;
  const host = Math.abs((hash >> 4) % 240) + 10;
  return `10.50.${subnet}.${host}`;
}

/**
 * Format real timestamp into a dynamic human time (e.g., "12:08:45 PM")
 */
export function getDynamicLastActive(timestamp?: number): string {
  const ts = timestamp && timestamp > 0 ? timestamp : Date.now();
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Format relative elapsed time dynamically (e.g. "Just now", "4s ago", "2m ago")
 */
export function formatRelativeLastSeen(timestamp?: number): string {
  if (!timestamp || timestamp <= 0) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

/**
 * Extract genuine device & browser properties dynamically from the environment
 */
export function getDynamicDeviceInfo(): {
  browser: string;
  os: string;
  screenResolution: string;
  isMobile: boolean;
} {
  if (typeof window === 'undefined') {
    return { browser: 'Unknown', os: 'Unknown', screenResolution: '1920x1080', isMobile: false };
  }

  const ua = navigator.userAgent;
  let browser = 'Chrome';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/OPR\//i.test(ua) || /Opera\//i.test(ua)) browser = 'Opera';
  else if (/Brave/i.test(ua)) browser = 'Brave';

  let os = 'Windows';
  if (/Win/i.test(ua)) os = 'Windows';
  else if (/Mac/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';

  const screenResolution = `${window.screen?.width || window.innerWidth || 1920}x${window.screen?.height || window.innerHeight || 1080}`;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);

  return { browser, os, screenResolution, isMobile };
}
