import { parseCodeSparkConfig, readBody, requireAdmin, setApiHeaders, supabaseRest } from "./_security.js";
import { gradeRound2Code, normalizeRound2Key } from "./_round2-grader.js";

const cleanId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 80);

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET" || req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      if (req.method === "GET") {
        const rows = await supabaseRest("candidate_stations?id=like.r2_sub_*&select=id,code,student,last_updated_timestamp&order=last_updated_timestamp.desc");
        return res.status(200).json({ success: true, submissions: rows || [] });
      }
      await supabaseRest("candidate_stations?id=like.r2_sub_*", { method: "DELETE" });
      await supabaseRest("candidate_stations?id=like.r2_station_*", { method: "DELETE" });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[CodeSpark submissions admin]", error?.message || "request failed");
      return res.status(503).json({ success: false, error: "Submission storage is temporarily unavailable." });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }
  const submission = body.submission;
  const key = normalizeRound2Key(submission?.round2Key || submission?.candidateKey);
  if (!submission || typeof submission !== "object" || key.length < 8) {
    return res.status(400).json({ success: false, error: "Valid Round 2 candidate credentials are required." });
  }

  try {
    const rosterRows = await supabaseRest("candidate_stations?id=eq.codespark_system_config&select=code,student");
    const roster = parseCodeSparkConfig(rosterRows?.[0]);
    const candidate = roster?.candidates?.find((item) => item.round2Key && normalizeRound2Key(item.round2Key) === key);
    if (!candidate || !(candidate.isShortlisted || candidate.status === "SHORTLISTED" || candidate.round2Key)) {
      return res.status(403).json({ success: false, error: "A valid shortlisted Round 2 key is required." });
    }

    const reports = submission.questionReports && typeof submission.questionReports === "object" ? submission.questionReports : {};
    const reportEntries = Object.entries(reports).slice(0, 5);
    const isSubmitted = submission.isSubmitted === true;
    const safeReports = {};
    let totalScore = 0;
    let maxScore = 0;
    let dominantLanguage = "Python";

    for (const [number, raw] of reportEntries) {
      const questionNumber = Number(number);
      const code = String(raw?.code || "");
      const language = String(raw?.language || "Python");
      const questionId = String(raw?.questionId || "");
      if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 5 || code.length > 100000) continue;

      let report;
      if (isSubmitted) {
        report = await gradeRound2Code(key, questionId, code, language);
        totalScore += report.score;
        maxScore += report.maxScore;
      } else {
        report = {
          questionId, sampleResults: [], hiddenResults: [], passedTests: 0,
          totalTests: 0, score: 0, maxScore: 0, status: "PENDING"
        };
      }
      safeReports[questionNumber] = {
        questionNumber, questionId, questionTitle: String(raw?.questionTitle || "").slice(0, 200),
        code, language, ...report, compiledAt: Date.now()
      };
      if (language) dominantLanguage = language;
    }

    const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
    const stableCandidateId = `candidate:${roll}`;
    const safeSubmission = {
      candidateKey: stableCandidateId,
      candidateName: candidate.name,
      rollNumber: candidate.rollNumber || "",
      email: candidate.email || "",
      department: candidate.department || "",
      questionReports: safeReports,
      currentQuestion: Math.min(5, Math.max(1, Number(submission.currentQuestion) || 1)),
      totalScore: isSubmitted ? totalScore : 0,
      maxScore: isSubmitted ? maxScore : 0,
      isSubmitted,
      startedAt: Number(submission.startedAt) || Date.now(),
      submittedAt: isSubmitted ? Date.now() : undefined,
      dominantLanguage,
      assignedProblemIds: Object.values(safeReports).map((report) => report.questionId),
      updatedAt: Date.now()
    };

    const rowId = `r2_sub_${cleanId(roll)}`;
    await supabaseRest("candidate_stations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        id: rowId, lab_id: "ROUND_2_ARENA",
        station_number: String(submission.stationNumber || "Station #01").slice(0, 80),
        status: isSubmitted ? "SUBMITTED" : "IN_PROGRESS",
        code: JSON.stringify(safeSubmission),
        student: {
          name: candidate.name, rollNumber: candidate.rollNumber || "",
          email: candidate.email || "", score: safeSubmission.totalScore,
          maxScore: safeSubmission.maxScore, isSubmitted
        },
        last_updated_timestamp: Date.now()
      }])
    });
    return res.status(200).json({ success: true, submission: safeSubmission });
  } catch (error) {
    console.error("[CodeSpark submission]", error?.message || "submission failed");
    return res.status(error.statusCode || 503).json({
      success: false,
      error: error.statusCode ? error.message : "Submission could not be securely processed. Please retry."
    });
  }
}
