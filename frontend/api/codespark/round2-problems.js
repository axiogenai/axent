import { readBody, requireAdmin, setApiHeaders, supabaseRest } from "./_security.js";

const CONFIG_ID = "codespark_round2_questions";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });

  const wantsAdminRead = req.method === "GET" && String(req.query?.admin || "") === "1";
  const admin = req.method === "POST" || wantsAdminRead ? await requireAdmin(req, res) : null;
  if ((req.method === "POST" || wantsAdminRead) && !admin) return;

  try {
    if (req.method === "GET") {
      const rows = await supabaseRest(`candidate_stations?id=eq.${CONFIG_ID}&select=code,student`);
      const row = rows?.[0];
      let config = row?.student && typeof row.student === "object" ? row.student : null;
      if (!config && row?.code) { try { config = JSON.parse(row.code); } catch {} }
      const problems = Array.isArray(config?.problems) ? config.problems : [];
      if (admin) {
        return res.status(200).json({ success: true, problems });
      }
      // Candidate problem payloads contain statements and starter code only.
      // Test inputs/expected outputs stay exclusively in server-side storage.
      const publicProblems = problems.map((problem) => {
        const {
          sampleTestCases: _samples,
          hiddenTestCases: _hidden,
          performanceTestCases: _performance,
          robustnessTestCases: _robustness,
          ...publicProblem
        } = problem;
        return {
          ...publicProblem,
          sampleTestCases: [],
          hiddenTestCases: [],
          performanceTestCases: [],
          robustnessTestCases: []
        };
      });
      return res.status(200).json({ success: true, problems: publicProblems });
    }

    const body = readBody(req);
    if (!Array.isArray(body.problems) || body.problems.length > 20) {
      return res.status(400).json({ success: false, error: "Invalid problem configuration." });
    }
    for (const problem of body.problems) {
      if (!problem || typeof problem !== "object" || !Array.isArray(problem.sampleTestCases) || !Array.isArray(problem.hiddenTestCases)) {
        return res.status(400).json({ success: false, error: "Each problem must include sample and hidden test case arrays." });
      }
      const performanceTests = Array.isArray(problem.performanceTestCases) ? problem.performanceTestCases : [];
      const robustnessTests = Array.isArray(problem.robustnessTestCases) ? problem.robustnessTestCases : [];
      if (problem.sampleTestCases.length > 30 || problem.hiddenTestCases.length > 200 ||
          performanceTests.length > 100 || robustnessTests.length > 100 ||
          problem.hiddenTestCases.length + performanceTests.length + robustnessTests.length > 230) {
        return res.status(400).json({ success: false, error: "Test case limit exceeded." });
      }
      const allGradingTests = [...problem.hiddenTestCases, ...performanceTests, ...robustnessTests];
      const hasCorrectnessTest = problem.hiddenTestCases.some((test) => {
        const category = String(test?.category || (test?.isPerformance ? "performance" : test?.isRobustness ? "robustness" : "correctness")).toLowerCase();
        return category !== "performance" && category !== "robustness";
      });
      if (!hasCorrectnessTest) {
        return res.status(400).json({ success: false, error: "Each problem needs at least one hidden correctness test." });
      }
      if (allGradingTests.some((test) => !test || typeof test !== "object" ||
          !Object.prototype.hasOwnProperty.call(test, "input") ||
          !Object.prototype.hasOwnProperty.call(test, "expectedOutput"))) {
        return res.status(400).json({ success: false, error: "Every grading test must include input and expectedOutput fields." });
      }
      // Performance cases are admin-authored large-input scalability checks.
      // The existing Wandbox API does not expose per-program runtime or memory thresholds.
    }
    const config = { problems: body.problems, updatedAt: Date.now() };
    await supabaseRest("candidate_stations?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        id: CONFIG_ID, lab_id: "SYSTEM_CONFIG", station_number: "CONFIG",
        status: "CONFIG", code: JSON.stringify(config), student: config,
        last_updated_timestamp: Date.now()
      }])
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[CodeSpark problem API]", error?.message || "storage error");
    return res.status(503).json({ success: false, error: "Problem storage is temporarily unavailable." });
  }
}
