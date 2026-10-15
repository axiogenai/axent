// ============================================================================
// Axent Render Backend Background Keep-Alive Service
// Silently heartbeats https://axent-b0wl.onrender.com/api/health/ while the
// application is open in candidate or authority sessions.
// ============================================================================

const HEALTH_ENDPOINT = (import.meta.env.VITE_BACKEND_URL || 'https://axent-b0wl.onrender.com') + '/api/health/';
const PING_INTERVAL_MS = 6 * 60 * 1000; // 6 minutes (Render spins down at 15 mins)

let isInitialized = false;

export function initBackendKeepAlive(): void {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  const ping = async () => {
    try {
      await fetch(HEALTH_ENDPOINT, { mode: 'cors', cache: 'no-store' });
    } catch {
      // Non-critical background ping
    }
  };

  // Immediate ping on launch
  void ping();

  // Repeating heartbeat every 6 minutes
  setInterval(ping, PING_INTERVAL_MS);
}
