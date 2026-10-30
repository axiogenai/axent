import { createHash } from "node:crypto";
import { readBody, setApiHeaders, supabaseRest } from "./_security.js";
import { getRound2AssignedProblems, normalizeRound2Key } from "./_round2-grader.js";

const cleanId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 80);

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }
  const key = normalizeRound2Key(body.key);
  const code = String(body.code || "");
  const language = String(body.language || "Python");
  const questionNumber = Number(body.questionNumber);
  if (key.length < 4 || code.length > 100000 || !["Python", "C", "C++", "Java"].includes(language) || !Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 5) {
    return res.status(400).json({ success: false, error: "Invalid live-code update." });
  }
  try {
    const { candidate, problems } = await getRound2AssignedProblems(key);
    const candidateHash = createHash("sha256").update(normalizeRound2Key(key)).digest("hex");
    const finalized = await supabaseRest(`codespark_round2_finalizations?candidate_hash=eq.${candidateHash}&select=candidate_hash`);
    if (finalized?.length) {
      return res.status(409).json({ success: false, error: "This Round 2 submission has already been finalized." });
    }
    const problem = problems[questionNumber - 1];
    if (!problem) return res.status(403).json({ success: false, error: "Question is not assigned to this candidate." });
    const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
    const rowId = `r2_station_${cleanId(roll)}`;
    const existingRows = await supabaseRest(`candidate_stations?id=eq.${rowId}&select=student`);
    const startedAt = Number(existingRows?.[0]?.student?.startedAt) || Date.now();
    await supabaseRest("candidate_stations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        id: rowId, lab_id: "ROUND_2_ARENA",
        station_number: String(body.stationNumber || "Station #01").slice(0, 80),
        status: "IN_PROGRESS", code, language,
        student: {
          name: candidate.name, rollNumber: candidate.rollNumber || "",
          email: candidate.email || "", currentQuestion: questionNumber, startedAt
        },
        last_updated_timestamp: Date.now()
      }])
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[CodeSpark live code]", error?.message || "sync failed");
    return res.status(error.statusCode || 503).json({ success: false, error: error.statusCode ? error.message : "Live code sync is temporarily unavailable." });
  }
}
