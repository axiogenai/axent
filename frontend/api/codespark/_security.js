import { createHash } from "node:crypto";
const json = (res, status, body) => res.status(status).json(body);

export function setApiHeaders(req, res) {
  const origin = req.headers.origin;
  const configuredOrigins = (process.env.APP_ALLOWED_ORIGINS || "https://axent.axiogen.in")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (process.env.VERCEL_URL) configuredOrigins.push(`https://${process.env.VERCEL_URL}`);
  const allowed = configuredOrigins.map((value) => value.startsWith("http") ? value : `https://${value}`);
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

export async function requireServiceRole() {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase service configuration is missing.");
  return { base, key };
}

export async function supabaseRest(path, options = {}) {
  const { base, key } = await requireServiceRole();
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}).`);
  return raw ? JSON.parse(raw) : null;
}

export function parseCodeSparkConfig(row) {
  if (!row) return null;
  if (row.student && typeof row.student === "object" && Array.isArray(row.student.candidates)) return row.student;
  if (row.code) {
    try { const parsed = JSON.parse(row.code); if (Array.isArray(parsed.candidates)) return parsed; } catch {}
  }
  return null;
}

function lookupIpHash(req, serviceKey) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || String(req.socket?.remoteAddress || "unknown");
  return createHash("sha256").update(`${ip}:${serviceKey}`).digest("hex");
}

export async function isCandidateLookupRateLimited(req) {
  const { key } = await requireServiceRole();
  const ipHash = lookupIpHash(req, key);
  const since = encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString());
  const rows = await supabaseRest(`codespark_key_lookup_attempts?ip_hash=eq.${ipHash}&attempted_at=gte.${since}&select=id`);
  return Array.isArray(rows) && rows.length >= 25;
}

export async function recordFailedCandidateLookup(req) {
  const { key } = await requireServiceRole();
  const ipHash = lookupIpHash(req, key);
  await supabaseRest("codespark_key_lookup_attempts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ ip_hash: ipHash }])
  });
}

export async function getCodeSparkRosterConfig() {
  const rows = await supabaseRest("candidate_stations?id=eq.codespark_system_config&select=code,student");
  let config = parseCodeSparkConfig(rows?.[0]);
  if (!config) {
    const legacy = await supabaseRest("mcq_exams?id=eq.codespark_system_config&select=instructions");
    if (legacy?.[0]?.instructions) {
      try {
        const parsed = JSON.parse(legacy[0].instructions);
        if (Array.isArray(parsed.candidates)) config = parsed;
      } catch {}
    }
  }
  return config;
}

const candidateHash = (value) => createHash("sha256").update(String(value || "").trim().toUpperCase()).digest("hex");

export async function isRound2EvaluationRateLimited(key) {
  const hash = candidateHash(key);
  const since = encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString());
  const rows = await supabaseRest(`codespark_round2_eval_attempts?candidate_hash=eq.${hash}&attempted_at=gte.${since}&select=id`);
  return Array.isArray(rows) && rows.length >= 120;
}

export async function recordRound2Evaluation(key) {
  await supabaseRest("codespark_round2_eval_attempts", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ candidate_hash: candidateHash(key) }])
  });
}
