// ============================================================================
// Axent Render Backend Keep-Alive Service
// Pings https://axent-b0wl.onrender.com/api/health/ every 10 minutes to prevent
// Render free-tier inactive spin-down.
// ============================================================================

const TARGET_URL = process.env.RENDER_HEALTH_URL || 'https://axent-b0wl.onrender.com/api/health/';
const INTERVAL_MINUTES = 10;
const INTERVAL_MS = INTERVAL_MINUTES * 60 * 1000;

async function ping() {
  const time = new Date().toISOString();
  try {
    const start = Date.now();
    const res = await fetch(TARGET_URL);
    const duration = Date.now() - start;
    const body = await res.json().catch(() => ({}));
    console.log(`[${time}] Keep-alive ping (${res.status} OK in ${duration}ms):`, body);
  } catch (error) {
    console.warn(`[${time}] Keep-alive ping attempt failed:`, error.message);
  }
}

console.log(`[Axent Cron] Starting keep-alive daemon for: ${TARGET_URL}`);
console.log(`[Axent Cron] Frequency: Every ${INTERVAL_MINUTES} minutes`);

// Immediate ping on boot
ping();

// Recurring interval
setInterval(ping, INTERVAL_MS);
