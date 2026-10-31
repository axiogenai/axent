import { isRound2EvaluationRateLimited, readBody, recordRound2Evaluation, setApiHeaders } from "./_security.js";
import { gradeRound2Code, normalizeRound2Key, runRound2Code } from "./_round2-grader.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });

  let body;
  try { body = readBody(req); }
  catch { return res.status(400).json({ success: false, error: "Invalid request." }); }

  const key = normalizeRound2Key(body.key);
  try {
    if (await isRound2EvaluationRateLimited(key)) {
      return res.status(429).json({ success: false, error: "Evaluation limit reached. Please wait before running more tests." });
    }

    if (body.action === "run") {
      const result = await runRound2Code(
        body.key, body.problemId, body.code, body.language, body.stdin ?? "", false
      );
      await recordRound2Evaluation(key);
      return res.status(200).json({ success: true, result });
    }

    const result = await gradeRound2Code(
      body.key, body.problemId, body.code, body.language, false, body.stdin ?? body.customStdin ?? ""
    );
    await recordRound2Evaluation(key);
    // Never serialize per-test details to the candidate. The full report is
    // generated and retained only by the protected server-side submission flow.
    const { questionId, score, maxScore, status, runResult } = result;
    return res.status(200).json({ success: true, questionId, score, maxScore, status, runResult });
  } catch (error) {
    console.error("[CodeSpark grading]", error?.message || "grading failure");
    return res.status(error.statusCode || 503).json({
      success: false,
      error: error.statusCode ? error.message : "Server-side compiler is temporarily unavailable. Please try again."
    });
  }
}
