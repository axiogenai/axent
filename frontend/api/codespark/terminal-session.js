import { createHash, createHmac, randomBytes } from "node:crypto";
import { readBody, setApiHeaders } from "./_security.js";
import { getRound2AssignedProblems, normalizeRound2Key } from "./_round2-grader.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }

  const secret = process.env.CODE_RUNNER_SECRET;
  const runnerUrl = process.env.CODE_RUNNER_URL;
  if (!secret || !runnerUrl) return res.status(503).json({ success: false, error: "Interactive terminal service is not configured yet." });

  const key = String(body.key || "").trim().toUpperCase();
  const code = String(body.code || "");
  const language = String(body.language || "");
  const problemId = String(body.problemId || "");
  if (key.length < 3 || !code.trim() || code.length > 100000 || !["C", "C++", "Python", "Java"].includes(language) || !problemId) {
    return res.status(400).json({ success: false, error: "Invalid terminal session request." });
  }
  try {
    const { problems } = await getRound2AssignedProblems(key, false);
    if (!problems.some((problem) => String(problem.id) === problemId)) {
      return res.status(403).json({ success: false, error: "This problem is not assigned to this candidate. Refresh your Round 2 assignment and try again." });
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: createHash("sha256").update(normalizeRound2Key(key)).digest("hex"),
      problem_id: problemId,
      language,
      code_sha256: createHash("sha256").update(code).digest("hex"),
      exp: now + 120
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return res.status(200).json({ success: true, token: encoded + "." + signature, runnerUrl: runnerUrl.replace(/\/+$/, "") });
  } catch (error) {
    console.error("[CodeSpark terminal session]", error?.message || "session failure");
    return res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : "Terminal session could not be authorized." });
  }
}
