import { parseCodeSparkConfig, readBody, setApiHeaders, supabaseRest } from "./_security.js";

const LANGUAGE = {
  Python: "cpython-3.10.15",
  "C++": "gcc-13.2.0",
  C: "gcc-13.2.0-c",
  Java: "openjdk-jdk-21+35"
};
const normalizeOutput = (value) => String(value ?? "").replace(/\r\n/g, "\n").trim();
const normalizeKey = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^(AXENT-R2-|AXENT-|R2-)/, "");

function assignedProblems(pool, key) {
  if (!Array.isArray(pool) || !pool.length) return [];
  if (pool.length <= 5) return pool;
  let seed = 0;
  for (const character of String(key).toUpperCase()) seed = (seed * 31 + character.charCodeAt(0)) >>> 0;
  const list = [...pool];
  let current = seed || 12345;
  for (let i = list.length - 1; i > 0; i--) {
    current = (current * 9301 + 49297) % 233280;
    const j = Math.floor((current / 233280) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 5);
}

async function execute(code, language, stdin) {
  const compiler = LANGUAGE[language];
  if (!compiler) throw new Error("Unsupported language.");
  const processedCode = language === "Java" ? code.replace(/\bpublic\s+class\b/g, "class ") : code;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://wandbox.org/api/compile.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compiler, code: processedCode, stdin: stdin || "" }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Compiler service unavailable.");
    const result = await response.json();
    const status = Number.parseInt(result.status || "0", 10);
    return {
      stdout: result.program_output || "",
      stderr: result.program_error || result.compiler_error || result.compiler_output || "",
      compileError: Boolean(result.compiler_error || result.compiler_output),
      isError: status !== 0 || Boolean(result.compiler_error || result.program_error)
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  setApiHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST method required." });
  let body;
  try { body = readBody(req); } catch { return res.status(400).json({ success: false, error: "Invalid request." }); }
  const key = normalizeKey(body.key);
  const code = String(body.code || "");
  const language = String(body.language || "");
  const problemId = String(body.problemId || "");
  if (key.length < 8 || key.length > 64 || !code.trim() || code.length > 100000 || !LANGUAGE[language] || !problemId) {
    return res.status(400).json({ success: false, error: "Invalid code evaluation request." });
  }

  try {
    const rosterRows = await supabaseRest("candidate_stations?id=eq.codespark_system_config&select=code,student");
    const roster = parseCodeSparkConfig(rosterRows?.[0]);
    const candidate = roster?.candidates?.find((item) => item.round2Key && normalizeKey(item.round2Key) === key);
    if (!candidate || !(candidate.isShortlisted || candidate.status === "SHORTLISTED" || candidate.round2Key)) {
      return res.status(403).json({ success: false, error: "A valid shortlisted Round 2 key is required." });
    }

    const problemRows = await supabaseRest("candidate_stations?id=eq.codespark_round2_questions&select=code,student");
    const problemConfig = problemRows?.[0]?.student && typeof problemRows[0].student === "object"
      ? problemRows[0].student
      : (() => { try { return JSON.parse(problemRows?.[0]?.code || "{}"); } catch { return {}; } })();
    const pool = Array.isArray(problemConfig.problems) ? problemConfig.problems : [];
    const problem = assignedProblems(pool, candidate.round2Key).find((item) => item.id === problemId);
    if (!problem) return res.status(403).json({ success: false, error: "This problem is not assigned to this candidate." });

    const tests = [
      ...(Array.isArray(problem.sampleTestCases) ? problem.sampleTestCases.map((test) => ({ ...test, hidden: false })) : []),
      ...(Array.isArray(problem.hiddenTestCases) ? problem.hiddenTestCases.map((test) => ({ ...test, hidden: true })) : [])
    ];
    if (!tests.length || tests.length > 230) return res.status(422).json({ success: false, error: "This problem has no valid evaluation cases." });

    const sampleResults = [];
    const hiddenResults = [];
    let passed = 0;
    let compileFailed = false;
    let runtimeFailed = false;
    for (const test of tests) {
      const result = await execute(code, language, String(test.input || ""));
      const success = !result.isError && normalizeOutput(result.stdout) === normalizeOutput(test.expectedOutput);
      if (success) passed++;
      if (result.compileError) compileFailed = true;
      else if (result.isError) runtimeFailed = true;
      if (test.hidden) hiddenResults.push({ testCaseId: String(test.id || ""), passed: success });
      else sampleResults.push({
        testCaseId: String(test.id || ""), input: String(test.input || ""),
        expected: String(test.expectedOutput || ""), actual: result.stdout,
        passed: success, error: result.stderr || undefined
      });
    }
    const total = tests.length;
    const score = Math.round((Number(problem.marks) || 20) * passed / total);
    const status = compileFailed ? "COMPILE_ERROR" : runtimeFailed && passed === 0 ? "RUNTIME_ERROR" : passed === total ? "ACCEPTED" : "PARTIAL";
    return res.status(200).json({
      success: true, sampleResults, hiddenResults, passedTests: passed,
      totalTests: total, score, maxScore: Number(problem.marks) || 20, status
    });
  } catch (error) {
    console.error("[CodeSpark grading]", error?.message || "grading failure");
    return res.status(503).json({ success: false, error: "Server-side evaluation is temporarily unavailable. Please try again." });
  }
}
