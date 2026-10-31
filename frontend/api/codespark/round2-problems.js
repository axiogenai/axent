import { readBody, requireAdmin, setApiHeaders, supabaseRest } from "./_security.js";

const CONFIG_ID = "codespark_round2_questions";

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed." });

  const admin = req.method === "POST" ? await requireAdmin(req, res) : null;
  if (req.method === "POST" && !admin) return;

  try {
    if (req.method === "GET") {
      const rows = await supabaseRest(`candidate_stations?id=eq.${CONFIG_ID}&select=code,student`);
      const row = rows?.[0];
      let config = row?.student && typeof row.student === "object" ? row.student : null;
      if (!config && row?.code) { try { config = JSON.parse(row.code); } catch {} }
      const problems = Array.isArray(config?.problems) ? config.problems : [];
      // Candidate problem payloads contain statements and starter code only.
      // Test inputs/expected outputs stay exclusively in server-side storage.
      const publicProblems = problems.map((problem) => {
        const { sampleTestCases: _samples, hiddenTestCases: _hidden, ...publicProblem } = problem;
        return { ...publicProblem, sampleTestCases: [], hiddenTestCases: [] };
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
          performanceTests.length > 100 || robustnessTests.length > 100) {
        return res.status(400).json({ success: false, error: "Test case limit exceeded." });
      }
      if (performanceTests.some((test) => !test || !Number.isFinite(Number(test.maxTimeMs)) || Number(test.maxTimeMs) <= 0 ||
          (test.maxMemoryKb != null && (!Number.isFinite(Number(test.maxMemoryKb)) || Number(test.maxMemoryKb) <= 0)))) {
        return res.status(400).json({ success: false, error: "Performance tests require positive maxTimeMs and optional positive maxMemoryKb thresholds." });
      }
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
