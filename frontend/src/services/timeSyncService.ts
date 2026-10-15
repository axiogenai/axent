/**
 * Autonomous Time Synchronization & Fullscreen Examination Engine
 * 
 * Provides:
 * 1. Millisecond-accurate NTP-style server time synchronization using HTTP Date headers
 *    with Round-Trip-Time (RTT) compensation against edge servers/Supabase.
 * 2. Cross-browser Fullscreen lifecycle management for tamper-proof examination mode.
 * 3. Reactive hooks for synchronized exam countdowns and live clocks.
 */

import { useState, useEffect, useRef } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://jswcwixeoilxuhbzojee.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzd2N3aXhlb2lseHVoYnpvamVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5NTU0OTMsImV4cCI6MjEwNzUzMTQ5M30.A73oIpxR0FdrK5GOb6zeEh-xH0NY3RuJoQY5hngOrew';

// In-memory synchronized clock offset (estimatedServerNow - localNow) in ms
let cachedOffset: number = 0;
let isSynced: boolean = false;
let isSyncing: boolean = false;
let lastSyncTimestamp: number = 0;

// Restore previously stored offset from sessionStorage if available
try {
  const saved = sessionStorage.getItem('codedna_server_time_offset');
  if (saved !== null) {
    const parsed = parseInt(saved, 10);
    if (!isNaN(parsed)) {
      cachedOffset = parsed;
      isSynced = true;
    }
  }
} catch {}

/**
 * Returns the current high-accuracy synchronized time (server time) in ms.
 * If server time hasn't finished syncing yet, gracefully falls back to local Date.now().
 */
export function getSynchronizedNow(): number {
  return Date.now() + cachedOffset;
}

/**
 * Returns the current clock offset in milliseconds (positive means local is behind server).
 */
export function getClockOffset(): number {
  return cachedOffset;
}

/**
 * Whether the client clock has been synchronized with the authoritative server.
 */
export function isTimeSynchronized(): boolean {
  return isSynced;
}

/**
 * Format timestamp into standard localized readable examination time.
 */
export function formatSynchronizedTime(timestamp: number = getSynchronizedNow()): string {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  } catch {
    return new Date(timestamp).toTimeString().substring(0, 8);
  }
}

/**
 * Synchronize with authoritative server time via HTTP HEAD request.
 * Measures round-trip time (RTT) and calculates network-compensated server offset.
 */
export async function syncServerTime(): Promise<number> {
  if (isSyncing) return cachedOffset;
  isSyncing = true;

  try {
    const endpointsToTry: { url: string; headers: Record<string, string> }[] = [];
    if (typeof window !== 'undefined' && window.location.origin) {
      endpointsToTry.push({ url: window.location.origin, headers: {} });
    }
    endpointsToTry.push({
      url: `${SUPABASE_URL}/rest/v1/`,
      headers: { apikey: SUPABASE_ANON_KEY }
    });

    for (const ep of endpointsToTry) {
      try {
        const t0 = Date.now();
        const res = await fetch(ep.url, {
          method: 'HEAD',
          headers: ep.headers,
          cache: 'no-store'
        });
        const t1 = Date.now();

        const dateHeader = res.headers ? res.headers.get('date') : null;
        if (dateHeader) {
          const serverTime = new Date(dateHeader).getTime();
          if (!isNaN(serverTime) && serverTime > 0) {
            const rtt = Math.max(0, t1 - t0);
            // Midpoint compensation for latency
            const estimatedServerNow = serverTime + Math.round(rtt / 2);
            const computedOffset = estimatedServerNow - t1;

            // Apply slight smoothing if we already had a sync
            if (isSynced && Math.abs(computedOffset - cachedOffset) < 3000) {
              cachedOffset = Math.round((cachedOffset * 3 + computedOffset) / 4);
            } else {
              cachedOffset = computedOffset;
            }

            isSynced = true;
            lastSyncTimestamp = t1;

            try {
              sessionStorage.setItem('codedna_server_time_offset', String(cachedOffset));
            } catch {}

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('codedna_timesync', {
                detail: { offset: cachedOffset, serverNow: getSynchronizedNow() }
              }));
            }

            return cachedOffset;
          }
        }
      } catch {
        // try next endpoint
      }
    }
  } catch (err) {
    console.warn('[TimeSync] Server clock sync failed, using client clock fallback:', err);
  } finally {
    isSyncing = false;
  }

  return cachedOffset;
}

// Initial background sync on module load
if (typeof window !== 'undefined') {
  void syncServerTime();

  // Re-sync on focus/visibility change (e.g. computer woke up from sleep or tab restored)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastSyncTimestamp > 60_000) {
      void syncServerTime();
    }
  });

  // Periodic resync every 3 minutes during long examination sessions
  setInterval(() => {
    void syncServerTime();
  }, 3 * 60 * 1000);
}

/**
 * React hook: High-precision synchronized countdown to a given deadline timestamp.
 */
export function useSynchronizedCountdown(deadline: number, onExpire: () => void) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - getSynchronizedNow()));
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;

    const tick = () => {
      if (expiredRef.current) return;
      const r = Math.max(0, deadline - getSynchronizedNow());
      setRemaining(r);
      if (r === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    };

    tick();
    const id = setInterval(tick, 500);

    const onSyncEvent = () => tick();
    window.addEventListener('codedna_timesync', onSyncEvent);

    return () => {
      clearInterval(id);
      window.removeEventListener('codedna_timesync', onSyncEvent);
    };
  }, [deadline, onExpire]);

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const isLow = remaining < 5 * 60_000; // < 5 mins
  const isCritical = remaining < 60_000; // < 1 min

  return { minutes, seconds, isLow, isCritical, remaining, isSynced };
}

/**
 * React hook: Live synchronized clock updating every second.
 */
export function useSynchronizedClock(intervalMs: number = 1000) {
  const [now, setNow] = useState<number>(() => getSynchronizedNow());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(getSynchronizedNow());
    }, intervalMs);

    const onSyncEvent = () => setNow(getSynchronizedNow());
    window.addEventListener('codedna_timesync', onSyncEvent);

    return () => {
      clearInterval(id);
      window.removeEventListener('codedna_timesync', onSyncEvent);
    };
  }, [intervalMs]);

  return {
    now,
    isSynced,
    offset: cachedOffset,
    formattedTime: formatSynchronizedTime(now)
  };
}

// ── FULLSCREEN UTILITIES ──────────────────────────────────────────────────────

/**
 * Check if the browser document is currently in fullscreen mode.
 */
export function isCurrentlyFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as any;
  return Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement
  );
}

/**
 * Request cross-browser native fullscreen mode on the root document.
 * Must be triggered directly inside a user interaction (like button click) to satisfy browser security.
 */
export async function requestExamFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isCurrentlyFullscreen()) return true;

  try {
    const docEl = (document.documentElement || document.body) as any;
    if (docEl.requestFullscreen) {
      await docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) {
      await docEl.webkitRequestFullscreen();
    } else if (docEl.mozRequestFullScreen) {
      await docEl.mozRequestFullScreen();
    } else if (docEl.msRequestFullscreen) {
      await docEl.msRequestFullscreen();
    }

    // Safe, non-destructive viewport layout recalculation without body transform mutation
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }

    return true;
  } catch (err) {
    console.warn('[FullScreen] Fullscreen request was denied or canceled:', err);
    return false;
  }
}

/**
 * Exit native fullscreen mode.
 */
export async function exitExamFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (!isCurrentlyFullscreen()) return true;

  try {
    const doc = document as any;
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      await doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      await doc.msExitFullscreen();
    }

    // Safe layout recalculation
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
    }

    return true;
  } catch (err) {
    console.warn('[FullScreen] Exit fullscreen failed:', err);
    return false;
  }
}
