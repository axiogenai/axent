import { createHash } from "node:crypto";
import { readBody, requireServiceRole, setApiHeaders, supabaseRest } from "../codespark/_security.js";

export const config = { maxDuration: 60 };

const MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];
const FALLBACKS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];

async function rateLimit(req) {
  const { key } = await requireServiceRole();
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || String(req.socket?.remoteAddress || "unknown");
  const ipHash = createHash("sha256").update(`${ip}:${key}`).digest("hex");
  const since = encodeURIComponent(new Date(Date.now() - 10 * 60 * 1000).toISOString());
  const rows = await supabaseRest(`axent_ai_request_attempts?ip_hash=eq.${ipHash}&attempted_at=gte.${since}&select=id`);
  if (Array.isArray(rows) && rows.length >= 30) return false;
  await supabaseRest("axent_ai_request_attempts", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ ip_hash: ipHash }])
  });
  return true;
}

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(503).json({ success: false, error: "The server-side AI provider is not configured." });

  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid AI request." }); }
  const messages = body.messages;
  const model = MODELS.includes(body.model) ? body.model : MODELS[0];
  const temperature = Math.max(0, Math.min(1.5, Number(body.temperature) || 0.1));
  const jsonMode = body.jsonMode === true;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 60) {
    return res.status(400).json({ success: false, error: "AI message count is invalid." });
  }
  let totalChars = 0;
  const safeMessages = [];
  for (const message of messages) {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string" || message.content.length > 30000) {
      return res.status(400).json({ success: false, error: "AI message format is invalid." });
    }
    totalChars += message.content.length;
    safeMessages.push({ role: message.role, content: message.content });
  }
  if (totalChars > 120000) return res.status(413).json({ success: false, error: "AI request is too large." });

  try {
    if (!(await rateLimit(req))) {
      return res.status(429).json({ success: false, error: "AI request limit reached. Please wait before trying again." });
    }
  } catch (error) {
    console.error("[Axent AI rate limit]", error?.message || "rate-limit storage unavailable");
    return res.status(503).json({ success: false, error: "AI service is temporarily unavailable." });
  }

  const models = [model, ...FALLBACKS.filter((candidate) => candidate !== model)];
  for (const activeModel of models) {
    const payload = {
      model: activeModel,
      messages: safeMessages,
      temperature,
      max_tokens: 4096
    };
    if (jsonMode && activeModel !== "openai/gpt-oss-20b") payload.response_format = { type: "json_object" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (jsonMode && response.status === 400 && payload.response_format) {
          delete payload.response_format;
          const retry = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          const retryData = await retry.json().catch(() => ({}));
          if (retry.ok) {
            const content = retryData.choices?.[0]?.message?.content || "";
            return res.status(200).json({ success: true, content, modelUsed: activeModel });
          }
        }
        if (response.status === 429 || response.status >= 500) continue;
        return res.status(502).json({ success: false, error: "The AI provider rejected the request. Check the prompt and model settings." });
      }
      const content = data.choices?.[0]?.message?.content || "";
      if (!content.trim()) continue;
      return res.status(200).json({ success: true, content, modelUsed: activeModel });
    } catch (error) {
      console.error("[Axent AI proxy]", error?.name || "provider error");
    } finally {
      clearTimeout(timer);
    }
  }
  return res.status(502).json({ success: false, error: "The AI provider is temporarily unavailable. Please retry." });
}
