import { createHash } from "node:crypto";
import { getCodeSparkRosterConfig, readBody, requireAdmin, setApiHeaders, supabaseRest } from "./_security.js";
import { getRound2AssignedProblems, gradeRound2Code, normalizeRound2Key } from "./_round2-grader.js";

export const config = { maxDuration: 60 };

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
        const roster = await getCodeSparkRosterConfig();
        const submissions = (rows || []).map((row) => {
          let submission = null;
          try { submission = row.code ? JSON.parse(row.code) : null; } catch {}
          const candidate = roster?.candidates?.find((item) =>
            String(item.rollNumber || "").trim().toUpperCase() === String(submission?.rollNumber || "").trim().toUpperCase()
          );
          if (!submission) return row;
          return { ...row, code: JSON.stringify({ ...submission, round2Key: candidate?.round2Key || "" }) };
        });
        return res.status(200).json({ success: true, submissions });
      }
      await supabaseRest("candidate_stations?id=like.r2_sub_*", { method: "DELETE" });
      await supabaseRest("candidate_stations?id=like.r2_station_*", { method: "DELETE" });
      await supabaseRest("codespark_round2_finalizations", { method: "DELETE" });
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[CodeSpark submissions admin]", error?.message || "request failed");
      return res.status(503).json({ success: false, error: "Submission storage is temporarily unavailable." });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }
  if (body.action === "get") {
    const key = normalizeRound2Key(body.key);
    if (key.length < 4 || key.length > 64) return res.status(400).json({ success: false, error: "Invalid Round 2 key." });
    try {
      const candidateHash = createHash("sha256").update(key).digest("hex");
      const rows = await supabaseRest(`codespark_round2_finalizations?candidate_hash=eq.${candidateHash}&select=result`);
      if (!rows?.[0]?.result) return res.status(404).json({ success: false, error: "No finalized submission was found." });
      return res.status(200).json({
        success: true,
        submission: { ...rows[0].result, candidateKey: String(body.key || "") }
      });
    } catch (error) {
      console.error("[CodeSpark submission retrieval]", error?.message || "lookup failed");
      return res.status(503).json({ success: false, error: "Final submission retrieval is temporarily unavailable." });
    }
  }

  const submission = body.submission;
  const key = normalizeRound2Key(submission?.round2Key || submission?.candidateKey);
  if (!submission || typeof submission !== "object" || key.length < 4) {
    return res.status(400).json({ success: false, error: "Valid Round 2 candidate credentials are required." });
  }

  try {
    const { candidate, problems } = await getRound2AssignedProblems(key);
    const reports = submission.questionReports && typeof submission.questionReports === "object" ? submission.questionReports : {};
    const reportEntries = Object.values(reports).slice(0, 5);
    const isSubmitted = submission.isSubmitted === true;
    const safeReports = {};
    let totalScore = 0;
    let maxScore = 0;
    let dominantLanguage = "Python";

    for (let index = 0; index < problems.length; index++) {
      const problem = problems[index];
      const raw = reportEntries.find((item) => String(item?.questionId || "") === String(problem.id)) || {};
      const code = String(raw?.code || "");
      const language = ["Python", "C", "C++", "Java"].includes(String(raw?.language)) ? String(raw.language) : "Python";
      const questionNumber = index + 1;
      if (code.length > 100000) return res.status(400).json({ success: false, error: "A code submission exceeds the allowed size." });

      let report;
      if (isSubmitted) {
        report = await gradeRound2Code(key, problem.id, code, language);
        totalScore += report.score;
        maxScore += report.maxScore;
      } else {
        report = {
          questionId: problem.id, sampleResults: [], hiddenResults: [], passedTests: 0,
          totalTests: 0, score: 0, maxScore: Number(problem.marks) || 20, status: "PENDING"
        };
      }
      safeReports[questionNumber] = {
        questionNumber, questionId: problem.id,
        questionTitle: String(problem.title || "").slice(0, 200),
        code, language, ...report, compiledAt: Date.now()
      };
      dominantLanguage = language;
    }

    const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
    const stableCandidateId = `candidate:${roll}`;
    const rowId = `r2_sub_${cleanId(roll)}`;
    const liveId = `r2_station_${cleanId(roll)}`;
    const priorProgressRows = await supabaseRest(`candidate_stations?id=eq.${rowId}&select=code`);
    let priorStartedAt = 0;
    try { priorStartedAt = Number(JSON.parse(priorProgressRows?.[0]?.code || "{}").startedAt) || 0; } catch {}
    const liveRows = await supabaseRest(`candidate_stations?id=eq.${liveId}&select=student`);
    const serverStartedAt = priorStartedAt || Number(liveRows?.[0]?.student?.startedAt) || Date.now();
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
      startedAt: serverStartedAt,
      submittedAt: isSubmitted ? Date.now() : undefined,
      dominantLanguage,
      assignedProblemIds: Object.values(safeReports).map((report) => report.questionId),
      updatedAt: Date.now()
    };

    const stationNumber = String(submission.stationNumber || "Station #01").slice(0, 80);
    const student = {
      name: candidate.name, rollNumber: candidate.rollNumber || "",
      email: candidate.email || "", score: safeSubmission.totalScore,
      maxScore: safeSubmission.maxScore, isSubmitted, startedAt: serverStartedAt
    };
    const candidateHash = createHash("sha256")
      .update(key)
      .digest("hex");

    if (isSubmitted) {
      const finalized = await supabaseRest("rpc/finalize_codespark_round2_submission", {
        method: "POST",
        body: JSON.stringify({
          p_candidate_hash: candidateHash,
          p_station_id: rowId,
          p_submission: safeSubmission,
          p_student: student,
          p_station_number: stationNumber
        })
      });
      const sealedSubmission = finalized?.submission || safeSubmission;
      return res.status(200).json({
        success: true,
        alreadyFinalized: finalized?.created === false,
        submission: { ...sealedSubmission, candidateKey: String(submission.candidateKey || submission.round2Key || "") }
      });
    }

    const progressSaved = await supabaseRest("rpc/save_codespark_round2_progress", {
      method: "POST",
      body: JSON.stringify({
        p_candidate_hash: candidateHash,
        p_station_id: rowId,
        p_submission: safeSubmission,
        p_student: student,
        p_station_number: stationNumber
      })
    });
    if (progressSaved !== true) {
      return res.status(409).json({ success: false, error: "This Round 2 submission has already been finalized and cannot be changed." });
    }
    return res.status(200).json({
      success: true,
      submission: { ...safeSubmission, candidateKey: String(submission.candidateKey || submission.round2Key || "") }
    });
  } catch (error) {
    console.error("[CodeSpark submission]", error?.message || "submission failed");
    return res.status(error.statusCode || 503).json({
      success: false,
      error: error.statusCode ? error.message : "Submission could not be securely processed. Please retry."
    });
  }
}
