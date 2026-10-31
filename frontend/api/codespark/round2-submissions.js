import { createHash } from "node:crypto";
import { getCodeSparkRosterConfig, readBody, requireAdmin, setApiHeaders, supabaseRest } from "./_security.js";
import { getRound2AssignedProblems, gradeRound2Code, normalizeRound2Key } from "./_round2-grader.js";

export const config = { maxDuration: 60 };

const cleanId = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "_").slice(0, 80);

function candidateSafeSubmission(submission) {
  if (!submission || typeof submission !== "object") return submission;
  const questionReports = {};
  for (const [question, report] of Object.entries(submission.questionReports || {})) {
    if (!report || typeof report !== "object") continue;
    const {
      sampleResults: _sampleResults,
      hiddenResults: _hiddenResults,
      passedTests: _passedTests,
      totalTests: _totalTests,
      hiddenPassedTests: _hiddenPassedTests,
      hiddenTotalTests: _hiddenTotalTests,
      testResults: _testResults,
      rubric: _rubric,
      ...safeReport
    } = report;
    questionReports[question] = safeReport;
  }
  return { ...submission, questionReports };
}

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET" || req.method === "DELETE") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
      if (req.method === "GET") {
        const subRows = await supabaseRest("candidate_stations?id=like.r2_sub_*&select=id,code,student,last_updated_timestamp&order=last_updated_timestamp.desc");
        const liveRows = await supabaseRest("candidate_stations?id=like.r2_station_*&select=id,code,student,last_updated_timestamp,language,station_number&order=last_updated_timestamp.desc");
        const roster = await getCodeSparkRosterConfig();

        const submissionsMap = new Map();

        // 1. Populate live contestants in the arena so they show on leaderboard immediately
        (liveRows || []).forEach((row) => {
          const st = row.student || {};
          const roll = String(st.rollNumber || row.id.replace(/^r2_station_/, "")).trim().toUpperCase();
          const candidate = roster?.candidates?.find((c) => String(c.rollNumber || "").trim().toUpperCase() === roll);
          const syntheticSub = {
            candidateKey: candidate?.round2Key || candidate?.accessKey || roll,
            candidateName: st.name || candidate?.name || roll,
            rollNumber: roll,
            email: st.email || candidate?.email || "",
            department: candidate?.department || "Engineering",
            stationNumber: row.station_number || "Station #01",
            questionReports: {},
            currentQuestion: st.currentQuestion || 1,
            totalScore: 0,
            maxScore: 100,
            isSubmitted: false,
            startedAt: st.startedAt || row.last_updated_timestamp || Date.now(),
            dominantLanguage: row.language || "Python",
            updatedAt: row.last_updated_timestamp || Date.now(),
            round2Key: candidate?.round2Key || ""
          };
          submissionsMap.set(roll, { ...row, code: JSON.stringify(syntheticSub) });
        });

        // 2. Overwrite / merge with actual evaluated submissions
        (subRows || []).forEach((row) => {
          let submission = null;
          try { submission = row.code ? JSON.parse(row.code) : null; } catch {}
          if (!submission) return;
          const roll = String(submission.rollNumber || row.id.replace(/^r2_sub_/, "")).trim().toUpperCase();
          const candidate = roster?.candidates?.find((c) => String(c.rollNumber || "").trim().toUpperCase() === roll);
          submissionsMap.set(roll, {
            ...row,
            code: JSON.stringify({ ...submission, round2Key: candidate?.round2Key || submission.round2Key || "" })
          });
        });

        return res.status(200).json({ success: true, submissions: Array.from(submissionsMap.values()) });
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

  // 1. Handle live-code streaming branch
  if (body.action === "live-code" || req.query?.action === "live-code" || req.url?.includes("live-code") || (body.code !== undefined && body.questionNumber !== undefined)) {
    const rawKey = String(body.key || "").trim().toUpperCase();
    const key = normalizeRound2Key(rawKey);
    const code = String(body.code || "");
    const language = String(body.language || "Python");
    const questionNumber = Number(body.questionNumber || 1);
    if (rawKey.length < 3 || code.length > 100000 || !["Python", "C", "C++", "Java"].includes(language)) {
      return res.status(400).json({ success: false, error: "Invalid live-code update." });
    }
    try {
      const { candidate, problems } = await getRound2AssignedProblems(rawKey, false);
      const candidateHash = createHash("sha256").update(normalizeRound2Key(key)).digest("hex");
      const finalized = await supabaseRest(`codespark_round2_finalizations?candidate_hash=eq.${candidateHash}&select=candidate_hash`);
      if (finalized?.length) {
        return res.status(409).json({ success: false, error: "This Round 2 submission has already been finalized." });
      }
      const problem = problems[questionNumber - 1] || problems[0];
      const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
      const rowId = `r2_station_${cleanId(roll)}`;
      const existingRows = await supabaseRest(`candidate_stations?id=eq.${rowId}&select=student`);
      const startedAt = Number(existingRows?.[0]?.student?.startedAt) || Date.now();
      await supabaseRest("candidate_stations?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify([{
          id: rowId,
          lab_id: "ROUND_2_ARENA",
          station_number: String(body.stationNumber || "Station #01").slice(0, 80),
          status: "IN_PROGRESS",
          code,
          language,
          exam_mode: "CODING",
          student: {
            name: candidate.name,
            rollNumber: candidate.rollNumber || "",
            email: candidate.email || "",
            currentQuestion: questionNumber,
            startedAt,
            assignmentTitle: "Round 2 Algorithmic Code Sprint",
            course: "Round 2 Code Sprint"
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

  // 2. Handle final submission lookup
  if (body.action === "get") {
    const key = normalizeRound2Key(body.key);
    if (key.length < 4 || key.length > 64) return res.status(400).json({ success: false, error: "Invalid Round 2 key." });
    try {
      const candidateHash = createHash("sha256").update(key).digest("hex");
      const rows = await supabaseRest(`codespark_round2_finalizations?candidate_hash=eq.${candidateHash}&select=result`);
      if (rows?.[0]?.result) {
        return res.status(200).json({
          success: true,
          submission: { ...candidateSafeSubmission(rows[0].result), candidateKey: String(body.key || "") }
        });
      }

      // If grading previously failed, restore the retryable code snapshot rather than
      // forcing the candidate to re-enter work after a browser refresh.
      const { candidate } = await getRound2AssignedProblems(key, false);
      const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
      const progressId = `r2_sub_${cleanId(roll)}`;
      const progressRows = await supabaseRest(`candidate_stations?id=eq.${progressId}&select=code`);
      let progress = null;
      try {
        const stored = progressRows?.[0]?.code;
        progress = typeof stored === "string" ? JSON.parse(stored) : stored;
      } catch {}
      if (progress && progress.isSubmitted !== true && progress.questionReports) {
        return res.status(200).json({
          success: true,
          isProgress: true,
          submission: { ...candidateSafeSubmission(progress), candidateKey: String(body.key || "") }
        });
      }
      return res.status(404).json({ success: false, error: "No saved Round 2 submission was found." });
    } catch (error) {
      console.error("[CodeSpark submission retrieval]", error?.message || "lookup failed");
      return res.status(503).json({ success: false, error: "Final submission retrieval is temporarily unavailable." });
    }
  }

  // 3. Handle Full Submission / Progress Save
  const submission = body.submission;
  const rawKey = String(submission?.round2Key || submission?.candidateKey || "").trim().toUpperCase();
  const key = normalizeRound2Key(rawKey);
  if (!submission || typeof submission !== "object" || rawKey.length < 3) {
    return res.status(400).json({ success: false, error: "Valid Round 2 candidate credentials are required." });
  }

  try {
    const isSubmitted = submission.isSubmitted === true;
    const { candidate, problems } = await getRound2AssignedProblems(rawKey, false);
    const reports = submission.questionReports && typeof submission.questionReports === "object" ? submission.questionReports : {};
    const reportEntries = Object.values(reports).slice(0, 5);

    const roll = String(candidate.rollNumber || candidate.email || candidate.name || "candidate").trim();
    const stableCandidateId = `candidate:${roll}`;
    const rowId = `r2_sub_${cleanId(roll)}`;
    const liveId = `r2_station_${cleanId(roll)}`;
    const stationNumber = String(submission.stationNumber || "Station #01").slice(0, 80);
    const candidateHash = createHash("sha256").update(key).digest("hex");
    if (isSubmitted) {
      const existingFinalized = await supabaseRest(
        `codespark_round2_finalizations?candidate_hash=eq.${candidateHash}&select=result`
      );
      if (existingFinalized?.[0]?.result) {
        return res.status(200).json({
          success: true,
          alreadyFinalized: true,
          submission: {
            ...candidateSafeSubmission(existingFinalized[0].result),
            candidateKey: String(submission.candidateKey || submission.round2Key || "")
          }
        });
      }
    }

    const priorProgressRows = await supabaseRest(`candidate_stations?id=eq.${rowId}&select=code`);
    let priorStartedAt = 0;
    try { priorStartedAt = Number(JSON.parse(priorProgressRows?.[0]?.code || "{}").startedAt) || 0; } catch {}
    const liveRows = await supabaseRest(`candidate_stations?id=eq.${liveId}&select=student`);
    const serverStartedAt = priorStartedAt || Number(liveRows?.[0]?.student?.startedAt) || Date.now();

    // Persist the submitted source code as retryable progress BEFORE calling the compiler.
    // If Wandbox is unavailable or a benchmark times out, the candidate's work is already safe.
    if (isSubmitted) {
      const progressReports = {};
      for (let index = 0; index < problems.length; index++) {
        const problem = problems[index];
        const raw = reportEntries.find((item) => String(item?.questionId || "") === String(problem.id)) || {};
        const code = String(raw?.code || "");
        const language = ["Python", "C", "C++", "Java"].includes(String(raw?.language)) ? String(raw.language) : "Python";
        if (code.length > 100000) return res.status(400).json({ success: false, error: "A code submission exceeds the allowed size." });
        progressReports[index + 1] = {
          questionNumber: index + 1,
          questionId: problem.id,
          questionTitle: String(problem.title || "").slice(0, 200),
          code,
          language,
          score: 0,
          maxScore: Number(problem.marks) > 0 ? Number(problem.marks) : 20,
          status: code.trim() ? "GRADING" : "UNATTEMPTED"
        };
      }
      const progressSnapshot = {
        candidateKey: stableCandidateId,
        candidateName: candidate.name,
        rollNumber: candidate.rollNumber || "",
        email: candidate.email || "",
        department: candidate.department || "",
        questionReports: progressReports,
        currentQuestion: Math.min(5, Math.max(1, Number(submission.currentQuestion) || 1)),
        totalScore: 0,
        maxScore: 0,
        isSubmitted: false,
        startedAt: serverStartedAt,
        dominantLanguage: "Python",
        assignedProblemIds: Object.values(progressReports).map((report) => report.questionId),
        updatedAt: Date.now()
      };
      const progressSaved = await supabaseRest("rpc/save_codespark_round2_progress", {
        method: "POST",
        body: JSON.stringify({
          p_candidate_hash: candidateHash,
          p_station_id: rowId,
          p_submission: progressSnapshot,
          p_student: {
            name: candidate.name,
            rollNumber: candidate.rollNumber || "",
            email: candidate.email || "",
            score: 0,
            maxScore: 0,
            isSubmitted: false,
            startedAt: serverStartedAt
          },
          p_station_number: stationNumber
        })
      });
      if (progressSaved === false) {
        const existingFinalized = await supabaseRest(
          `codespark_round2_finalizations?candidate_hash=eq.${candidateHash}&select=result`
        );
        if (existingFinalized?.[0]?.result) {
          return res.status(200).json({
            success: true,
            alreadyFinalized: true,
            submission: {
              ...candidateSafeSubmission(existingFinalized[0].result),
              candidateKey: String(submission.candidateKey || submission.round2Key || "")
            }
          });
        }
        return res.status(409).json({
          success: false,
          error: "This submission has already been finalized. Refresh to retrieve the sealed result."
        });
      }
    }

    const gradingDeadlineAt = Date.now() + 45000;
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
      if (!code || !code.trim()) {
        report = {
          questionId: problem.id,
          sampleResults: [],
          hiddenResults: [],
          passedTests: 0,
          totalTests: 0,
          score: 0,
          maxScore: Number(problem.marks) || 20,
          status: "UNATTEMPTED"
        };
        maxScore += report.maxScore;
      } else if (isSubmitted) {
        try {
          report = await gradeRound2Code(key, problem.id, code, language, false, "", gradingDeadlineAt);
        } catch (gradingError) {
          console.error("[CodeSpark grading]", gradingError?.message || "evaluation failed");
          return res.status(gradingError?.statusCode || 503).json({
            success: false,
            retryable: !gradingError?.statusCode || gradingError.statusCode >= 500,
            error: gradingError?.statusCode === 422
              ? gradingError.message
              : "Automatic grading is temporarily unavailable. Your submission has not been finalized. Please retry."
          });
        }
        totalScore += report.score || 0;
        maxScore += report.maxScore || 20;
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

    const student = {
      name: candidate.name, rollNumber: candidate.rollNumber || "",
      email: candidate.email || "", score: safeSubmission.totalScore,
      maxScore: safeSubmission.maxScore, isSubmitted, startedAt: serverStartedAt
    };
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
        submission: { ...candidateSafeSubmission(sealedSubmission), candidateKey: String(submission.candidateKey || submission.round2Key || "") }
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
    if (progressSaved === false) {
      return res.status(409).json({
        success: false,
        error: "This submission has already been finalized. Refresh to retrieve the sealed result."
      });
    }


    return res.status(200).json({
      success: true,
      submission: { ...candidateSafeSubmission(safeSubmission), candidateKey: String(submission.candidateKey || submission.round2Key || "") }
    });
  } catch (error) {
    console.error("[CodeSpark submission]", error?.message || "submission failed");
    return res.status(error.statusCode || 503).json({
      success: false,
      error: error.statusCode ? error.message : "Submission could not be securely processed. Please retry."
    });
  }
}
