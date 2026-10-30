import { readBody, setApiHeaders } from "./_security.js";
import { gradeRound2Code } from "./_round2-grader.js";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }
  try {
    const result = await gradeRound2Code(body.key, body.problemId, body.code, body.language);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("[CodeSpark grading]", error?.message || "grading failure");
    return res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : "Server-side evaluation is temporarily unavailable. Please try again." });
  }
}
