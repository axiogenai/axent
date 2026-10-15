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
 * Force the Chromium GPU compositor to push a new frame to the Windows DWM swapchain.
 * Fixes the classic Chromium hardware acceleration bug where the display compositor
 * fails to swap frames during window state / fullscreen transitions until minimized/resized.
 */
function kickChromiumCompositor(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const target = (document.getElementById('root') || document.body) as HTMLElement | null;
  if (!target) return;

  // Frame 1: promote layer and micro-shift opacity to invalidate render pass
  requestAnimationFrame(() => {
    try {
      target.style.opacity = '0.999';
      target.style.transform = 'translateZ(0)';
      void target.offsetHeight;
      void document.body?.offsetHeight;
    } catch {}

    // Frame 2: restore clean values on next VSync, guaranteeing compositor commits swapchain
    requestAnimationFrame(() => {
      try {
        target.style.removeProperty('opacity');
        target.style.removeProperty('transform');
        void target.offsetHeight;
        void document.body?.offsetHeight;
        window.dispatchEvent(new Event('resize'));
      } catch {}
    });
  });
}

/**
 * Apply inline styles that guarantee the entire height chain
 * (html → body → #root) stretches to fill the fullscreen container.
 */
function applyFullscreenInlineStyles(): void {
  try {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.height = '100%';
    html.style.overflow = 'auto';

    body.style.height = '100%';
    body.style.overflow = 'auto';
    body.style.margin = '0';

    if (root) {
      root.style.minHeight = '100%';
      root.style.height = '100%';
      root.style.display = 'flex';
      root.style.flexDirection = 'column';
    }
  } catch {}
}

/**
 * Remove the inline styles applied by applyFullscreenInlineStyles,
 * returning control to the CSS stylesheet rules.
 */
function removeFullscreenInlineStyles(): void {
  try {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.removeProperty('height');
    html.style.removeProperty('overflow');

    body.style.removeProperty('height');
    body.style.removeProperty('overflow');
    body.style.removeProperty('margin');

    if (root) {
      root.style.removeProperty('min-height');
      root.style.removeProperty('height');
      root.style.removeProperty('display');
      root.style.removeProperty('flex-direction');
    }
  } catch {}
}

/**
 * Forces synchronous reflow + staggered compositor kicks to guarantee
 * Chromium on Windows DWM repaints immediately after fullscreen transition or exam submission.
 */
export function triggerViewportReflow(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (isCurrentlyFullscreen()) {
    applyFullscreenInlineStyles();
  } else {
    removeFullscreenInlineStyles();
  }

  kickChromiumCompositor();

  [20, 60, 140, 280, 500, 900].forEach((delay) => {
    setTimeout(() => {
      if (isCurrentlyFullscreen()) {
        applyFullscreenInlineStyles();
      }
      kickChromiumCompositor();
    }, delay);
  });
}

// Automatically catch native fullscreen events
if (typeof document !== 'undefined') {
  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((evt) => {
    document.addEventListener(evt, () => {
      if (isCurrentlyFullscreen()) {
        applyFullscreenInlineStyles();
      } else {
        removeFullscreenInlineStyles();
      }
      triggerViewportReflow();
    });
  });
}

/**
 * Get the target element for fullscreen mode.
 */
function getFullscreenTarget(): HTMLElement {
  return document.documentElement || document.getElementById('root') || document.body;
}

/**
 * Request cross-browser native fullscreen mode.
 * Must be triggered directly inside a user interaction (like button click) to satisfy browser security.
 */
export async function requestExamFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isCurrentlyFullscreen()) {
    applyFullscreenInlineStyles();
    triggerViewportReflow();
    return true;
  }

  try {
    const target = getFullscreenTarget() as any;
    if (target.requestFullscreen) {
      await target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      await target.webkitRequestFullscreen();
    } else if (target.mozRequestFullScreen) {
      await target.mozRequestFullScreen();
    } else if (target.msRequestFullscreen) {
      await target.msRequestFullscreen();
    }

    applyFullscreenInlineStyles();
    triggerViewportReflow();
    return true;
  } catch (err) {
    console.warn('[FullScreen] Fullscreen request was denied or canceled:', err);
    triggerViewportReflow();
    return false;
  }
}

/**
 * Exit native fullscreen mode cleanly.
 */
export async function exitExamFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (!isCurrentlyFullscreen()) {
    removeFullscreenInlineStyles();
    triggerViewportReflow();
    return true;
  }

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
  } catch (err) {
    console.warn('[FullScreen] Exit fullscreen failed:', err);
  } finally {
    removeFullscreenInlineStyles();
    triggerViewportReflow();
  }
  return true;
}
