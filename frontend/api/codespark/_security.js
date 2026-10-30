const json = (res, status, body) => res.status(status).json(body);

export function setApiHeaders(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.APP_ALLOWED_ORIGINS || process.env.VERCEL_URL || "")
    .split(",").map((value) => value.trim()).filter(Boolean)
    .map((value) => value.startsWith("http") ? value : `https://${value}`);
  if (origin && allowed.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

export async function requireAdmin(req, res) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    json(res, 401, { success: false, error: "Authentication required." });
    return null;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) {
    json(res, 503, { success: false, error: "Authentication service is not configured." });
    return null;
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${match[1]}` }
    });
    if (!response.ok) {
      json(res, 401, { success: false, error: "Session is invalid or expired." });
      return null;
    }
    const user = await response.json();
    if (!user?.id || user?.app_metadata?.role !== "admin") {
      json(res, 403, { success: false, error: "Administrator permission required." });
      return null;
    }
    return user;
  } catch {
    json(res, 503, { success: false, error: "Could not verify the authentication session." });
    return null;
  }
}

export function readBody(req) {
  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body.");
  return body;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export function smtpConfiguration() {
  const user = String(process.env.SMTP_USER || "").trim();
  const password = String(process.env.SMTP_PASSWORD || "").replace(/\s+/g, "");
  const host = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const fromName = String(process.env.SMTP_FROM_NAME || "CodeSpark 2026 Examination Authority").trim();
  if (!user || !password || !host || ![465, 587].includes(port)) return null;
  return { user, password, host, port, fromName };
}
